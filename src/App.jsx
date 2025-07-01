import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as Tone from 'tone'; // Import Tone.js for sound effects
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth'; 
import { getFirestore, collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { Home, Play, Award, User, RotateCcw, X, Check, Timer, Flower, Sun, TreeDeciduous, Leaf, Banana, Carrot } from 'lucide-react'; // Icons for UI (added Carrot for 玉蜀黍)

/* global __firebase_config, __app_id, __initial_auth_token */ // ESLint 全局变量声明

// Firebase initialization
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-hanzi-puzzle-app';

let app;
let db;
let auth;
let userId = 'anonymous'; // Default to anonymous

// Initialize Firebase only once
if (Object.keys(firebaseConfig).length > 0) {
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
    } catch (error) {
        console.error("Firebase initialization failed:", error);
    }
} else {
    console.warn("Firebase config not found. Leaderboard features will be disabled.");
}

// Global Tone.js setup
const successSynth = new Tone.Synth().toDestination();
const errorSynth = new Tone.Synth().toDestination();
const celebrationSynth = new Tone.PolySynth().toDestination();

// Flag to ensure Tone.start() is only called once after a user gesture
let audioContextStarted = false;

// Function to ensure audio context is running (必须在用户首次交互后调用)
const startAudioContext = async () => {
    if (!audioContextStarted && Tone.context.state !== 'running') {
        try {
            await Tone.start();
            audioContextStarted = true;
            console.log("Tone.js audio context started.");
        } catch (error) {
            console.error("Failed to start Tone.js audio context:", error);
        }
    }
};

// --- 音效防抖动变量 ---
let successSoundTimeout = null;
let errorSoundTimeout = null;
let celebrationSoundTimeout = null;
// 增加防抖时间，以应对快速点击导致的问题
const SOUND_DEBOUNCE_TIME_SHORT = 200; // 200毫秒内只允许触发一次短音效
const SOUND_DEBOUNCE_TIME_LONG = 750; // 750毫秒内只允许触发一次长音效 (用于庆祝音效)


// Function to play success sound (柔和的点击声，用于正确放置汉字或轻微交互)
const playSuccessSound = () => {
    if (!audioContextStarted) startAudioContext(); // 确保音频上下文在交互时启动
    if (successSoundTimeout) return;
    successSynth.triggerAttackRelease("A5", "32n"); 
    successSoundTimeout = setTimeout(() => {
        successSoundTimeout = null;
    }, SOUND_DEBOUNCE_TIME_SHORT);
};

// Function to play error sound (柔和的错误提示声，用于放置错误)
const playErrorSound = () => {
    if (!audioContextStarted) startAudioContext(); // 确保音频上下文在交互时启动
    if (errorSoundTimeout) return;
    errorSynth.triggerAttackRelease("F#4", "32n"); 
    errorSoundTimeout = setTimeout(() => {
        errorSoundTimeout = null;
    }, SOUND_DEBOUNCE_TIME_SHORT);
};

// Function to play celebration sound (欢快的庆祝音效，用于完成一个词语)
const playCelebrationSound = () => {
    if (!audioContextStarted) startAudioContext(); // 确保音频上下文在交互时启动
    if (celebrationSoundTimeout) return;
    celebrationSynth.triggerAttackRelease(["C6", "E6", "G6", "C7"], "0.5"); 
    celebrationSoundTimeout = setTimeout(() => {
        celebrationSoundTimeout = null;
    }, SOUND_DEBOUNCE_TIME_LONG);
};

// Chinese words for the game, now with pinyin and icons
const chineseWords = [
    { id: 'mujin', name: '木槿', characters: ['木', '槿'], pinyin: 'mù jǐn', icon: <Flower size={36} /> },
    { id: 'xiangrikui', name: '向日葵', characters: ['向', '日', '葵'], pinyin: 'xiàng rì kuí', icon: <Sun size={36} /> },
    { id: 'liulianshu', name: '榴梿树', characters: ['榴', '梿', '树'], pinyin: 'liú lián shù', icon: <TreeDeciduous size={36} /> },
    { id: 'niaozaojue', name: '鸟巢蕨', characters: ['鸟', '巢', '蕨'], pinyin: 'niǎo cháo jué', icon: <Leaf size={36} /> },
    { id: 'xiangjiaoshu', name: '香蕉树', characters: ['香', '蕉', '树'], pinyin: 'xiāng jiāo shù', icon: <Banana size={36} /> },
    { id: 'yushushu', name: '玉蜀黍', characters: ['玉', '蜀', '黍'], pinyin: 'yù shǔ shǔ', icon: <Carrot size={36} /> }, // 新增的词语
];

// Helper function to shuffle an array
const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

// Helper component for message display (replaces alert)
const MessageModal = ({ message, onClose }) => {
    if (!message) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full text-center space-y-4 border-4 border-blue-500 animate-fade-in-up">
                <p className="text-2xl font-bold text-gray-800">{message}</p>
                <button
                    onClick={onClose}
                    className="mt-4 px-6 py-3 bg-blue-500 text-white font-bold rounded-full shadow-lg hover:bg-blue-600 transition duration-300 transform hover:scale-105"
                >
                    好的
                </button>
            </div>
        </div>
    );
};

// Login Page Component
const LoginPage = ({ onLogin }) => {
    const [name, setName] = useState('');
    const [message, setMessage] = useState('');

    const handleStart = async () => { // Make handleStart async
        if (name.trim()) {
            // Attempt to start audio context on first user gesture (Login button click)
            await startAudioContext(); 
            onLogin(name.trim());
        } else {
            setMessage('请告诉我你的名字，小园丁！');
        }
    };

    return (
        // 移除背景渐变，让全局背景图片显示
        <div className="flex flex-col items-center justify-center min-h-screen p-4 font-inter"> 
            <MessageModal message={message} onClose={() => setMessage('')} />
            <div className="bg-white p-8 rounded-3xl shadow-2xl border-8 border-yellow-400 text-center space-y-8 max-w-md w-full animate-pop-in">
                <h1 className="text-5xl font-extrabold text-blue-600 drop-shadow-lg animate-bounce-subtle">
                    欢迎来到汉字拼拼乐花园！
                </h1>
                <p className="text-2xl text-gray-700 mt-4">我是小园丁，我叫：</p>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="在这里输入你的名字"
                    className="w-full p-4 text-2xl border-4 border-green-400 rounded-2xl focus:outline-none focus:ring-4 focus:ring-green-300 transition duration-200 shadow-inner"
                    maxLength="15"
                />
                <button
                    onClick={handleStart}
                    className="w-full p-5 bg-orange-500 text-white font-bold text-3xl rounded-full shadow-xl hover:bg-orange-600 transition duration-300 transform hover:scale-105 active:scale-95 animate-pulse-fade"
                >
                    开始探险！
                </button>
            </div>
        </div>
    );
};

// Mode Selection Page Component
const ModeSelectionPage = ({ onSelectMode, userName }) => {
    const [message, setMessage] = useState(''); 

    return (
        // 移除背景渐变，让全局背景图片显示
        <div className="flex flex-col items-center justify-center min-h-screen p-4 font-inter"> 
            <MessageModal message={message} onClose={() => setMessage('')} />
            <div className="bg-white p-8 rounded-3xl shadow-2xl border-8 border-pink-400 text-center space-y-8 max-w-md w-full animate-pop-in">
                {/* 调整标题字体大小以适应不同屏幕，保持居中和动画 */}
                <h1 className="text-4xl sm:text-4xl md:text-5xl lg:text-5xl xl:text-6xl font-extrabold text-purple-600 drop-shadow-lg mb-8 text-center animate-bounce-subtle">
                    选择你的探险模式！
                </h1>
                <p className="text-3xl text-gray-700 mb-8">你好，{userName}！</p>
                <button
                    onClick={() => onSelectMode('practice')}
                    className="w-full p-6 bg-blue-500 text-white font-bold text-3xl rounded-full shadow-xl hover:bg-blue-600 transition duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center space-x-3 mb-6 animate-pulse-fade"
                >
                    <Home size={36} /> <span>自由探索模式</span>
                </button>
                <button
                    onClick={() => onSelectMode('challenge')}
                    className="w-full p-6 bg-red-500 text-white font-bold text-3xl rounded-full shadow-xl hover:bg-red-600 transition duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center space-x-3 animate-pulse-fade"
                >
                    <Award size={36} /> <span>限时挑战模式</span>
                </button>
            </div>
        </div>
    );
};

// Game Page Component
const GamePage = ({ mode, userName, onGameEnd, onGoBackToModeSelection }) => {
    const [currentWordIndex, setCurrentWordIndex] = useState(0);
    const [shuffledCharacters, setShuffledCharacters] = useState([]);
    const [placedCharacters, setPlacedCharacters] = useState([]);
    const [feedback, setFeedback] = useState(null); // 'correct', 'incorrect'
    const [timer, setTimer] = useState(0);
    const [draggableChar, setDraggableChar] = useState(null); // For drag and drop
    const [message, setMessage] = useState(''); // For modal messages
    const [allWordsCompleted, setAllWordsCompleted] = useState(false);
    const [isCelebrating, setIsCelebrating] = useState(false); // New state to control celebration and transition
    const [confettiVisible, setConfettiVisible] = useState(false); // State for confetti

    const timerRef = useRef(null); // Use ref to hold interval ID
    const dragItemRef = useRef(null);
    const dragOverItemRef = useRef(null);

    const currentWord = chineseWords[currentWordIndex];

    // Effect to initialize/reset game state for the current word
    // This runs when the word changes (e.g., advancing to the next puzzle)
    useEffect(() => {
        if (!currentWord) return;
        const chars = currentWord.characters.map((char, index) => ({
            char,
            originalIndex: index,
            id: `${currentWord.id}-${char}-${index}`,
        }));
        setShuffledCharacters(shuffleArray(chars));
        setPlacedCharacters(Array(chars.length).fill(null));
        setFeedback(null);
        setDraggableChar(null);
        setAllWordsCompleted(false);
    }, [currentWordIndex, currentWord]);

    // Effect to manage challenge mode timer
    // This will run ONCE when mode becomes 'challenge' and restarts if mode changes back to 'challenge'
    useEffect(() => {
        let intervalId;
        if (mode === 'challenge') {
            setTimer(0); // Reset timer to 0 every time challenge mode is entered/re-entered
            intervalId = setInterval(() => {
                setTimer((prev) => {
                    // console.log("Timer ticking:", prev + 1); // Debugging log
                    return prev + 1;
                });
            }, 1000);
            timerRef.current = intervalId; // Store interval ID in ref
        } else {
            // If mode is not challenge, ensure timer is stopped
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            setTimer(0); // Reset timer if switching out of challenge mode
        }

        // Cleanup function for this effect
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [mode]); // Only re-run when 'mode' changes

    // Check if the current word is correctly assembled
    const checkWordCompletion = useCallback(() => {
        if (!currentWord) {
            console.error("currentWord is undefined in checkWordCompletion");
            return;
        }

        const isComplete = placedCharacters.every((charObj, index) =>
            charObj && charObj.char === currentWord.characters[index]
        );

        if (isComplete) {
            setIsCelebrating(true); // Start celebration state
            setConfettiVisible(true); // Show confetti
            playCelebrationSound();
            setFeedback('correct');

            setTimeout(() => {
                setFeedback(null);
                setConfettiVisible(false); // Hide confetti
                if (currentWordIndex < chineseWords.length - 1) {
                    // Move to next word
                    setCurrentWordIndex((prev) => prev + 1);
                    setIsCelebrating(false); // End celebration state after transition
                } else {
                    // Game finished or looping in practice mode!
                    if (mode === 'practice') {
                        setMessage('恭喜你完成所有汉字拼图！为你重新开始！'); // New message for looping
                        // Message will disappear after 2 seconds
                        setTimeout(() => setMessage(''), 2000); 
                        setCurrentWordIndex(0); // Loop back to the first word
                        setIsCelebrating(false); // End celebration
                    } else if (mode === 'challenge') {
                        setAllWordsCompleted(true); // For challenge mode, truly completed
                        if (timerRef.current) {
                            clearInterval(timerRef.current);
                            timerRef.current = null;
                        }
                        let finalScore = calculateScore(timer);
                        setMessage(`恭喜你完成所有挑战！你的总用时是 ${timer} 秒，得分 ${finalScore}！`);
                        onGameEnd(finalScore, userName, timer);
                        setIsCelebrating(false); // End celebration
                    }
                }
            }, 1500); // Allow time for celebration
        }
    }, [placedCharacters, currentWord, currentWordIndex, chineseWords.length, mode, timer, userName, onGameEnd]);

    // This useEffect calls checkWordCompletion whenever placedCharacters changes
    useEffect(() => {
        // Only check for completion if all slots are filled AND not currently celebrating
        if (placedCharacters.every(Boolean) && placedCharacters.length === currentWord.characters.length && !isCelebrating) {
            checkWordCompletion();
        }
    }, [placedCharacters, currentWord, checkWordCompletion, isCelebrating]); 

    // Handle character click (for mobile/tablet without drag)
    const handleCharacterClick = (charObj) => {
        if (isCelebrating) return; // Prevent interaction during celebration

        if (!currentWord) {
            console.error("currentWord is undefined in handleCharacterClick");
            return;
        }

        if (draggableChar === null) {
            setDraggableChar(charObj);
        } else {
            const targetIndex = placedCharacters.findIndex(p => p === null);
            if (targetIndex !== -1) {
                const newPlaced = [...placedCharacters];
                newPlaced[targetIndex] = draggableChar;
                setPlacedCharacters(newPlaced);

                if (draggableChar.char === currentWord.characters[targetIndex]) {
                    playSuccessSound();
                } else {
                    playErrorSound();
                    setTimeout(() => {
                        const updatedPlaced = [...newPlaced];
                        updatedPlaced[targetIndex] = null;
                        setPlacedCharacters(updatedPlaced);
                        setFeedback('incorrect');
                        setTimeout(() => setFeedback(null), 1000);
                    }, 500);
                }
                setShuffledCharacters(prev => prev.filter(c => c.id !== draggableChar.id));
                setDraggableChar(null);
            } else {
                setMessage('所有位置都满了！请重置或检查已有拼图。');
            }
        }
    };

    // Handle target slot click (for mobile/tablet to place selected char)
    const handleSlotClick = (index) => {
        if (isCelebrating) return; // Prevent interaction during celebration

        if (!currentWord) {
            console.error("currentWord is undefined in handleSlotClick");
            return;
        }

        if (draggableChar !== null && placedCharacters[index] === null) {
            const newPlaced = [...placedCharacters];
            newPlaced[index] = draggableChar;
            setPlacedCharacters(newPlaced);

            if (draggableChar.char === currentWord.characters[index]) {
                playSuccessSound();
            } else {
                playErrorSound();
                setTimeout(() => {
                    const updatedPlaced = [...newPlaced];
                    updatedPlaced[index] = null;
                    setPlacedCharacters(updatedPlaced);
                    setFeedback('incorrect');
                    setTimeout(() => setFeedback(null), 1000);
                }, 500);
            }
            setShuffledCharacters(prev => prev.filter(c => c.id !== draggableChar.id));
            setDraggableChar(null);
        } else if (placedCharacters[index] !== null) {
            const charToMoveBack = placedCharacters[index];
            const newPlaced = [...placedCharacters];
            newPlaced[index] = null;
            setPlacedCharacters(newPlaced);
            setShuffledCharacters(prev => [...prev, charToMoveBack]);
            setDraggableChar(null);
        } else if (draggableChar === null) {
            setMessage('请先选择一个汉字拼图块！');
        }
    };

    // Drag & Drop Handlers
    const handleDragStart = (e, charObj) => {
        if (isCelebrating) {
            e.preventDefault(); // Prevent dragging during celebration
            return;
        }
        dragItemRef.current = charObj;
        e.dataTransfer.setData("text/plain", JSON.stringify(charObj));
        setDraggableChar(charObj);
        e.target.classList.add('opacity-50');
    };

    const handleDragEnter = (e, index) => {
        if (isCelebrating) return;
        dragOverItemRef.current = index;
        e.preventDefault();
    };

    const handleDragOver = (e) => {
        if (isCelebrating) return;
        e.preventDefault();
    };

    const handleDrop = (e, targetIndex) => {
        if (isCelebrating) return; // Prevent dropping during celebration

        e.preventDefault();
        const draggedElements = document.querySelectorAll('.opacity-50');
        draggedElements.forEach(el => el.classList.remove('opacity-50'));

        if (!dragItemRef.current) return;

        const draggedChar = dragItemRef.current;
        dragItemRef.current = null;

        if (!currentWord) {
            console.error("currentWord is undefined in handleDrop");
            setDraggableChar(null);
            return;
        }

        if (targetIndex !== undefined) {
            if (placedCharacters[targetIndex] === null) {
                const newPlaced = [...placedCharacters];
                newPlaced[targetIndex] = draggedChar;
                setPlacedCharacters(newPlaced);

                setShuffledCharacters(prev => prev.filter(c => c.id !== draggedChar.id));

                if (draggedChar.char === currentWord.characters[targetIndex]) {
                    playSuccessSound();
                } else {
                    playErrorSound();
                    setTimeout(() => {
                        const updatedPlaced = [...newPlaced];
                        updatedPlaced[targetIndex] = null;
                        setPlacedCharacters(updatedPlaced);
                        setShuffledCharacters(prev => [...prev, draggedChar]);
                        setFeedback('incorrect');
                        setTimeout(() => setFeedback(null), 1000);
                    }, 500);
                }
            } else {
                setMessage('这个位置已经被占用了！');
                setShuffledCharacters(prev => {
                    if (!prev.find(c => c.id === draggedChar.id)) {
                        return [...prev, draggedChar];
                    }
                    return prev;
                });
            }
        } else {
            setShuffledCharacters(prev => {
                if (!prev.find(c => c.id === draggedChar.id) && !placedCharacters.includes(draggedChar)) {
                    return [...prev, draggedChar];
                }
                return prev;
            });
        }
        setDraggableChar(null);
    };

    const handleDragEnd = (e) => {
        e.target.classList.remove('opacity-50');
        dragItemRef.current = null;
        setDraggableChar(null);
    };

    // Calculate score based on time (simple example)
    const calculateScore = (time) => {
        const baseScore = 100 * chineseWords.length;
        const penalty = time * 2;
        return Math.max(0, baseScore - penalty);
    };

    const handleResetWord = () => {
        if (!currentWord) return; // Prevent error if currentWord is undefined during a rapid state change
        const chars = currentWord.characters.map((char, index) => ({
            char,
            originalIndex: index,
            id: `${currentWord.id}-${char}-${index}`,
        }));
        setShuffledCharacters(shuffleArray(chars));
        setPlacedCharacters(Array(chars.length).fill(null));
        setFeedback(null);
        setDraggableChar(null);
    };

    const formatTime = (seconds) => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    return (
        // 移除背景渐变，让全局背景图片显示
        <div className="flex flex-col md:flex-row items-start min-h-screen p-4 font-inter text-gray-800">
            <MessageModal message={message} onClose={() => setMessage('')} />

            {/* 彩带容器，确保z-index足够高使其显示在最上层 */}
            {confettiVisible && (
                <div className="confetti-container" style={{ zIndex: 1000 }}>
                    {Array.from({ length: 50 }).map((_, i) => (
                        <div
                            key={i}
                            className="confetti"
                            style={{
                                left: `${Math.random() * 100}%`,
                                animationDelay: `${Math.random() * 2}s`,
                                backgroundColor: `hsl(${Math.random() * 360}, 100%, 75%)`,
                                width: `${10 + Math.random() * 10}px`, // 更大的彩带尺寸范围 (10px to 20px)
                                height: `${10 + Math.random() * 10}px`,
                                transform: `scale(${0.8 + Math.random() * 0.4})`, // 调整彩带大小范围，使其更明显 (0.8到1.2)
                                animationDuration: `${2 + Math.random() * 2}s` // Random duration
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Left Sidebar for Word Selection */}
            <div className="w-full md:w-1/5 bg-white p-4 rounded-3xl shadow-2xl border-8 border-orange-400 md:mr-4 mb-4 md:mb-0 animate-pop-in flex flex-row md:flex-col justify-center md:justify-start items-center space-x-2 md:space-x-0 md:space-y-4 flex-wrap">
                <h3 className="text-xl md:text-3xl font-extrabold text-purple-700 mb-4 text-center md:text-left w-full">选一选</h3> 
                {chineseWords.map((word, index) => (
                    <button
                        key={word.id}
                        onClick={() => {
                            if (isCelebrating) return; // Prevent changing word during celebration
                            setCurrentWordIndex(index);
                            setDraggableChar(null); 
                        }}
                        className={`flex items-center justify-center p-3 md:p-4 rounded-full transition duration-300 transform hover:scale-110 shadow-md flex-shrink-0
                            ${index === currentWordIndex ? 'bg-purple-500 text-white border-4 border-purple-700' : 'bg-gray-200 text-gray-700 border-2 border-gray-300'}`}
                        title={word.name} 
                        disabled={isCelebrating} // Disable button during celebration
                    >
                        {word.icon}
                    </button>
                ))}
                {/* Back to Mode Selection Button */}
                <button
                    onClick={onGoBackToModeSelection}
                    className="mt-6 w-full p-3 md:p-4 bg-gray-500 text-white font-bold text-xl rounded-full shadow-lg hover:bg-gray-600 transition duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center space-x-2"
                    disabled={isCelebrating} // Disable button during celebration (for 1.5s)
                >
                    <Home size={28} /> <span className="hidden md:inline">返回模式选择</span>
                </button>
            </div>

            {/* Main Game Content Area */}
            <div className="flex-grow w-full md:w-4/5 bg-white p-6 rounded-3xl shadow-2xl border-8 border-orange-400 animate-pop-in">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-4xl font-extrabold text-purple-700 drop-shadow-md">
                        {mode === 'practice' ? '自由探索模式' : '限时挑战模式'}
                    </h2>
                    {mode === 'challenge' && (
                        <div className="flex items-center text-3xl font-bold text-red-600">
                            <Timer size={36} className="mr-2" />
                            <span>时间: {formatTime(timer)}</span>
                        </div>
                    )}
                </div>

                <div className="mb-8 text-center">
                    <h3 className="text-5xl font-extrabold text-blue-600 mb-4 animate-bounce-subtle">
                        {currentWord ? currentWord.pinyin : '加载中...'} {/* Display Pinyin */}
                    </h3>
                </div>

                <div className="mb-10 p-6 bg-blue-100 rounded-2xl border-4 border-blue-300 shadow-inner min-h-[120px] flex justify-center items-center flex-wrap gap-4"
                     onDrop={(e) => handleDrop(e, undefined)} 
                     onDragOver={handleDragOver}>
                    {shuffledCharacters.length === 0 && placedCharacters.every(Boolean) ? (
                        <div className="text-3xl text-gray-500 animate-pulse">拼图完成！</div>
                    ) : (
                        shuffledCharacters.map((charObj) => (
                            <div
                                key={charObj.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, charObj)}
                                onDragEnd={handleDragEnd}
                                onClick={() => handleCharacterClick(charObj)}
                                className={`cursor-grab active:cursor-grabbing p-4 md:p-6 bg-white rounded-xl shadow-lg border-4 border-yellow-500 text-5xl font-bold text-green-700 select-none transform transition duration-200 ease-out hover:scale-105 active:scale-95
                                    ${draggableChar && draggableChar.id === charObj.id ? 'opacity-50 border-dashed border-red-500' : ''}`}
                                disabled={isCelebrating} // Disable during celebration
                            >
                                {charObj.char}
                            </div>
                        ))
                    )}
                </div>

                <div className="flex justify-center items-center min-h-[150px] bg-red-100 rounded-2xl border-4 border-red-300 shadow-inner p-6 flex-wrap gap-4">
                    {currentWord && currentWord.characters.map((char, index) => (
                        <div
                            key={index}
                            onDrop={(e) => handleDrop(e, index)}
                            onDragOver={handleDragOver}
                            onDragEnter={(e) => handleDragEnter(e, index)}
                            onClick={() => handleSlotClick(index)}
                            className={`relative w-24 h-24 md:w-28 md:h-28 flex items-center justify-center border-4 border-dashed rounded-xl transition duration-200 ease-out text-5xl font-bold
                                ${placedCharacters[index] ? 'bg-white border-green-500 text-green-700 shadow-md' : 'bg-gray-100 border-gray-400 text-gray-400'}
                                ${feedback === 'incorrect' && !placedCharacters[index] && draggableChar && draggableChar.char !== char ? 'border-red-500 animate-shake' : ''}
                                ${feedback === 'correct' && placedCharacters[index] && placedCharacters[index].char === char ? 'border-green-500 animate-pop-in' : ''}
                                ${draggableChar && placedCharacters[index] === null ? 'bg-yellow-200' : ''}
                                `}
                        >
                            {placedCharacters[index] ? placedCharacters[index].char : '?'}
                            {feedback === 'correct' && placedCharacters[index] && placedCharacters[index].char === char && (
                                <Check size={48} className="absolute top-1 right-1 text-green-600 animate-check-fade-in" />
                            )}
                            {feedback === 'incorrect' && placedCharacters[index] && placedCharacters[index].char !== char && (
                                <X size={48} className="absolute top-1 right-1 text-red-600 animate-check-fade-in" />
                            )}
                        </div>
                    ))}
                </div>

                {feedback === 'incorrect' && (
                    <div className="mt-4 text-center text-red-600 text-2xl font-bold animate-pulse">
                        <span className="flex items-center justify-center space-x-2">
                            <RotateCcw size={32} /> 再试一次！
                        </span>
                    </div>
                )}

                <div className="mt-8 flex justify-center space-x-4">
                    <button
                        onClick={handleResetWord}
                        className="px-6 py-3 bg-yellow-500 text-white font-bold text-2xl rounded-full shadow-lg hover:bg-yellow-600 transition duration-300 transform hover:scale-105 active:scale-95 flex items-center space-x-2"
                        disabled={isCelebrating} // Disable during celebration
                    >
                        <RotateCcw size={28} /> <span>重置当前</span>
                    </button>
                    {mode === 'practice' && allWordsCompleted && (
                        <button
                            onClick={() => {
                                setCurrentWordIndex(0);
                                setAllWordsCompleted(false);
                                handleResetWord();
                            }}
                            className="px-6 py-3 bg-blue-500 text-white font-bold text-2xl rounded-full shadow-lg hover:bg-blue-600 transition duration-300 transform hover:scale-105 active:scale-95 flex items-center space-x-2"
                            disabled={isCelebrating} // Disable during celebration
                        >
                            <Play size={28} /> <span>再玩一次</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

// Leaderboard Page Component
const LeaderboardPage = ({ onGoHome }) => {
    const [leaderboardData, setLeaderboardData] = useState([]);
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (!db) {
            setMessage("排行榜功能不可用，因为Firebase未初始化。");
            return;
        }

        const leaderboardCollectionRef = collection(db, `artifacts/${appId}/public/data/leaderboard`);
        const q = query(leaderboardCollectionRef, orderBy('score', 'desc'), orderBy('time', 'asc'), limit(10));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setLeaderboardData(data);
        }, (error) => {
            console.error("Error fetching leaderboard:", error);
            setMessage("加载排行榜失败，请稍后再试。");
        });

        return () => unsubscribe();
    }, []);

    return (
        // 移除背景渐变，让全局背景图片显示
        <div className="flex flex-col items-center min-h-screen p-4 font-inter">
            <MessageModal message={message} onClose={() => setMessage('')} />

            <div className="w-full max-w-3xl bg-white p-8 rounded-3xl shadow-2xl border-8 border-green-500 my-8 animate-pop-in">
                <h1 className="text-5xl font-extrabold text-blue-700 text-center mb-8 drop-shadow-lg animate-bounce-subtle">
                    排行榜
                </h1>
                {leaderboardData.length > 0 ? (
                    <div className="overflow-x-auto rounded-xl border-4 border-yellow-400 shadow-lg">
                        <table className="min-w-full bg-yellow-100 rounded-xl">
                            <thead className="bg-yellow-400 text-white text-2xl font-bold rounded-t-lg">
                                <tr>
                                    <th className="py-4 px-6 text-left rounded-tl-lg">排名</th>
                                    <th className="py-4 px-6 text-left">名字</th>
                                    <th className="py-4 px-6 text-left">得分</th>
                                    <th className="py-4 px-6 text-left">用时 (秒)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-yellow-300">
                                {leaderboardData.map((entry, index) => (
                                    <tr key={entry.id} className={`${index % 2 === 0 ? 'bg-yellow-50' : 'bg-yellow-100'} hover:bg-yellow-200 transition duration-200`}>
                                        <td className="py-4 px-6 text-xl font-semibold text-gray-800">{index + 1}</td>
                                        <td className="py-4 px-6 text-xl text-gray-700">{entry.name}</td>
                                        <td className="py-4 px-6 text-xl text-gray-700">{entry.score}</td>
                                        <td className="py-4 px-6 text-xl text-gray-700">{entry.time}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-2xl text-center text-gray-600 my-8">还没有人挑战哦，快来创造记录吧！</p>
                )}
                <div className="text-center mt-8">
                    <button
                        onClick={onGoHome}
                        className="px-8 py-4 bg-purple-500 text-white font-bold text-3xl rounded-full shadow-xl hover:bg-purple-600 transition duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center space-x-3 mx-auto"
                    >
                        <Home size={36} /> <span>回到主页</span>
                    </button>
                </div>
                <p className="text-sm text-gray-500 text-center mt-6">用户ID: {userId}</p>
            </div>
        </div>
    );
};

// Main App Component
function App() {
    const [currentPage, setCurrentPage] = useState('login'); // 'login', 'modeSelection', 'game', 'leaderboard'
    const [userName, setUserName] = useState('');
    const [gameMode, setGameMode] = useState(null); // 'practice' or 'challenge'
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [message, setMessage] = useState('');

    // Firebase Authentication Effect
    useEffect(() => {
        if (!auth) {
            setIsAuthReady(true); // Treat as ready if Firebase not configured
            return;
        }

        const authenticate = async () => {
            try {
                if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                    await signInWithCustomToken(auth, __initial_auth_token);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (error) {
                console.error("Firebase authentication error:", error);
                setMessage("认证失败，部分功能可能受限。");
            }
        };

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid; // Set global userId
                console.log("Firebase User ID:", userId);
            } else {
                userId = crypto.randomUUID(); // Fallback for anonymous
                console.log("Signed out or anonymous. Generated ID:", userId);
            }
            setIsAuthReady(true);
        });

        authenticate();

        return () => unsubscribe();
    }, []);

    const handleLogin = async (name) => { // 注意这里添加了 async
        if (name.trim()) {
            setUserName(name);
            setCurrentPage('modeSelection');

            // --- 新增代码：记录用户登录时间 ---
            if (db && isAuthReady) {
                try {
                    const userLoginsCollectionRef = collection(db, `artifacts/${appId}/public/data/user_logins`);
                    await addDoc(userLoginsCollectionRef, {
                        userId: userId, // 用户的唯一ID
                        userName: name, // 用户输入的姓名
                        loginTime: serverTimestamp(), // 登录时间
                    });
                    console.log("用户登录时间已记录！");
                } catch (error) {
                    console.error("记录登录时间失败:", error);
                    setMessage("记录登录时间失败，请检查网络或Firebase设置。");
                }
            } else {
                 console.warn("Firebase 未就绪，无法记录登录时间。");
            }
            // --- 新增代码结束 ---

        } else {
            setMessage('请告诉我你的名字，小园丁！');
        }
    };

    const handleSelectMode = (mode) => {
        setGameMode(mode);
        setCurrentPage('game');
    };

    const handleGameEnd = async (finalScore, playerName, totalTime) => {
        if (gameMode === 'challenge' && db && isAuthReady) {
            try {
                const leaderboardCollectionRef = collection(db, `artifacts/${appId}/public/data/leaderboard`);
                await addDoc(leaderboardCollectionRef, {
                    name: playerName,
                    score: finalScore,
                    time: totalTime,
                    userId: userId,
                    timestamp: serverTimestamp(),
                });
                setMessage('你的成绩已记录到排行榜！');
            } catch (error) {
                console.error("Error saving score to leaderboard:", error);
                setMessage("保存成绩到排行榜失败。");
            }
        }
        setCurrentPage('leaderboard');
    };

    const handleGoHome = () => {
        setCurrentPage('modeSelection');
    };

    const handleGoBackToModeSelection = () => {
        setCurrentPage('modeSelection');
    };

    const renderPage = () => {
        if (!isAuthReady) {
            return (
                <div className="flex items-center justify-center min-h-screen bg-gray-100">
                    <p className="text-2xl text-gray-700 animate-pulse">加载中...</p>
                </div>
            );
        }

        switch (currentPage) {
            case 'login':
                return <LoginPage onLogin={handleLogin} />;
            case 'modeSelection':
                return <ModeSelectionPage onSelectMode={handleSelectMode} userName={userName} />;
            case 'game':
                return <GamePage mode={gameMode} userName={userName} onGameEnd={handleGameEnd} onGoBackToModeSelection={handleGoBackToModeSelection} />;
            case 'leaderboard':
                return <LeaderboardPage onGoHome={handleGoHome} />;
            default:
                return <LoginPage onLogin={handleLogin} />;
        }
    };

    return (
        <div className="app-container">
            <MessageModal message={message} onClose={() => setMessage('')} />
            {renderPage()}
        </div>
    );
}

export default App;
