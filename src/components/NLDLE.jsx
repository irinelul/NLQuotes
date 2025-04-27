import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const NLDLE = () => {
  const navigate = useNavigate();
  const [currentRound, setCurrentRound] = useState(0);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  // Sample word pairs - in a real app, these would come from an API
  const wordPairs = [
    {
      option1: { text: "salmonella and campylobacter", count: 52 },
      option2: { text: "watermelon ass", count: 14 }
    },
    {
      option1: { text: "kingston, ontario", count: 148 },
      option2: { text: "ontario, canada", count: 34 }
    },
    {
      option1: { text: "garfield", count: 293 },
      option2: { text: "felix the cat", count: 5 }
    },
    {
      option1: { text: "severance", count: 220 },
      option2: { text: "breaking bad", count: 620 }
    },
    {
      option1: { text: "dracula flow", count: 19 },
      option2: { text: "potion seller", count: 57 }
    }
  ];

  const handleOptionSelect = (option) => {
    setSelectedOption(option);
    const currentPair = wordPairs[currentRound];
    const isCorrectAnswer = option === (currentPair.option1.count > currentPair.option2.count ? 1 : 2);
    setIsCorrect(isCorrectAnswer);
    setShowResult(true);
    
    if (isCorrectAnswer) {
      setScore(score + 1);
    }
  };

  const handleNextRound = () => {
    if (currentRound < wordPairs.length - 1) {
      setCurrentRound(currentRound + 1);
      setSelectedOption(null);
      setShowResult(false);
    } else {
      setGameOver(true);
    }
  };

  const handlePlayAgain = () => {
    setCurrentRound(0);
    setScore(0);
    setGameOver(false);
    setSelectedOption(null);
    setShowResult(false);
  };

  const handleBack = () => {
    navigate('/');
  };

  if (gameOver) {
    return (
      <div style={{ maxWidth: 800, margin: '2rem auto', padding: '2rem', background: 'var(--surface-color)', borderRadius: 12 }}>
        <h2>Game Over!</h2>
        <p>Your final score: {score} out of {wordPairs.length}</p>
        <button
          onClick={handlePlayAgain}
          style={{ marginRight: '1rem', padding: '0.5rem 1rem', background: '#4CAF50', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          Play Again
        </button>
        <button
          onClick={handleBack}
          style={{ padding: '0.5rem 1rem', background: '#f44336', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '2rem auto', padding: '2rem', background: 'var(--surface-color)', borderRadius: 12 }}>
      <button
        onClick={handleBack}
        style={{ marginBottom: '1.5rem', background: 'none', border: '1px solid #ccc', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 500, color: '#fff' }}
      >
        Go Back
      </button>
      
      <h2>NLDLE</h2>
      <p>Round {currentRound + 1} of {wordPairs.length}</p>
      <p>Score: {score}</p>

      <div style={{ marginTop: '2rem' }}>
        <h3>Which phrase was said more frequently?</h3>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <button
            onClick={() => handleOptionSelect(1)}
            disabled={showResult}
            style={{
              flex: 1,
              padding: '1rem',
              background: showResult ? (selectedOption === 1 ? (isCorrect ? '#4CAF50' : '#f44336') : '#666') : '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: showResult ? 'default' : 'pointer'
            }}
          >
            {wordPairs[currentRound].option1.text}
          </button>
          <button
            onClick={() => handleOptionSelect(2)}
            disabled={showResult}
            style={{
              flex: 1,
              padding: '1rem',
              background: showResult ? (selectedOption === 2 ? (isCorrect ? '#4CAF50' : '#f44336') : '#666') : '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: showResult ? 'default' : 'pointer'
            }}
          >
            {wordPairs[currentRound].option2.text}
          </button>
        </div>
      </div>

      {showResult && (
        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <p style={{ color: isCorrect ? '#4CAF50' : '#f44336', fontWeight: 'bold' }}>
            {isCorrect ? 'Correct!' : 'Incorrect!'}
          </p>
          <p>
            {wordPairs[currentRound].option1.text}: {wordPairs[currentRound].option1.count} times
            <br />
            <a 
              href={`https://nlquotes.com/search?q=${encodeURIComponent(wordPairs[currentRound].option1.text)}&channel=northernlion`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#2196F3', textDecoration: 'none', fontSize: '0.9rem' }}
            >
              View search results
            </a>
          </p>
          <p>
            {wordPairs[currentRound].option2.text}: {wordPairs[currentRound].option2.count} times
            <br />
            <a 
              href={`https://nlquotes.com/search?q=${encodeURIComponent(wordPairs[currentRound].option2.text)}&channel=northernlion`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#2196F3', textDecoration: 'none', fontSize: '0.9rem' }}
            >
              View search results
            </a>
          </p>
          <button
            onClick={handleNextRound}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#4CAF50', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            Next Round
          </button>
        </div>
      )}
    </div>
  );
};

export default NLDLE; 