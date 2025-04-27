import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import query from '../../services/quotes';
import './NLDLE.css';

const NLDLE = () => {
  const navigate = useNavigate();
  const [currentRound, setCurrentRound] = useState(0);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [roundResults, setRoundResults] = useState(Array(5).fill(null));
  const [animateResult, setAnimateResult] = useState(false);
  const [showTutorial, setShowTutorial] = useState(true);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  // Sample word pairs with earliest reference data
  const wordPairs = [
    {
      option1: { 
        text: "salmonella and campylobacter", 
        count: 52,
        earliestReference: "08 July 2022"
      },
      option2: { 
        text: "watermelon ass", 
        count: 14,
        earliestReference: "13 July 2021"
      }
    },
    {
      option1: { 
        text: "kingston, ontario", 
        count: 148,
        earliestReference: "04 November 2010"
      },
      option2: { 
        text: "ontario, canada", 
        count: 34,
        earliestReference: "04 November 2010"
      }
    },
    {
      option1: { 
        text: "garfield", 
        count: 293,
        earliestReference: "03 March 2013"
      },
      option2: { 
        text: "felix the cat", 
        count: 5,
        earliestReference: "02 August 2014"
      }
    },
    {
      option1: { 
        text: "severance", 
        count: 220,
        earliestReference: "08 February 2014"
      },
      option2: { 
        text: "breaking bad", 
        count: 620,
        earliestReference: "27 June 2011"
      }
    },
    {
      option1: { 
        text: "dracula flow", 
        count: 19,
        earliestReference: "28 September 2023"
      },
      option2: { 
        text: "potion seller", 
        count: 57,
        earliestReference: "15 October 2016"
      }
    }
  ];

  const handleStartGame = () => {
    setShowTutorial(false);
  };

  const handleOptionSelect = (option) => {
    setSelectedOption(option);
    const currentPair = wordPairs[currentRound];
    const isCorrectAnswer = option === (currentPair.option1.count > currentPair.option2.count ? 1 : 2);
    setIsCorrect(isCorrectAnswer);
    setShowResult(true);
    setAnimateResult(true);
    
    // Update round results
    const newRoundResults = [...roundResults];
    newRoundResults[currentRound] = isCorrectAnswer;
    setRoundResults(newRoundResults);
    
    if (isCorrectAnswer) {
      setScore(score + 1);
      setStreak(streak + 1);
      if (streak + 1 > bestStreak) {
        setBestStreak(streak + 1);
      }
    } else {
      setStreak(0);
    }
  };

  const handleNextRound = () => {
    if (currentRound < wordPairs.length - 1) {
      setCurrentRound(currentRound + 1);
      setSelectedOption(null);
      setShowResult(false);
      setAnimateResult(false);
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
    setAnimateResult(false);
    setRoundResults(Array(5).fill(null));
    setStreak(0);
  };

  const handleBack = () => {
    navigate('/');
  };

  const handleFeedbackSubmit = async (feedback) => {
    try {
      const response = await fetch('/api/flag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quote: "NLDLE Feedback",
          searchTerm: "NLDLE Feedback",
          timestamp: "0",
          videoId: "nldle-feedback",
          title: "NLDLE Feedback",
          channel: "User Feedback",
          reason: feedback
        })
      });

      if (!response.ok) {
        throw new Error('Failed to submit feedback');
      }

      alert('Thank you for your feedback!');
      document.querySelector('textarea').value = '';
    } catch (error) {
      console.error('Error submitting feedback:', error);
      alert('Unable to submit feedback. Please try again later.');
    }
  };

  const renderProgressIndicator = () => {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem' }}>
        {roundResults.map((result, index) => (
          <div
            key={index}
            style={{
              width: '2.5rem',
              height: '2.5rem',
              border: '2px solid #ccc',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: index === currentRound ? '#2196F3' : 'transparent',
              color: '#fff',
              fontSize: '1.4rem',
              fontWeight: 'bold',
              transition: 'all 0.3s ease',
              boxShadow: index === currentRound ? '0 0 10px rgba(33, 150, 243, 0.5)' : 'none'
            }}
          >
            {result === true ? '✓' : result === false ? '✗' : ''}
          </div>
        ))}
      </div>
    );
  };

  const renderProgressBar = () => {
    const progress = ((currentRound + 1) / wordPairs.length) * 100;
    return (
      <div style={{ width: '100%', height: '4px', background: '#333', borderRadius: '2px', marginTop: '1rem' }}>
        <div
          style={{
            width: `${progress}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #2196F3, #4CAF50)',
            borderRadius: '2px',
            transition: 'width 0.3s ease'
          }}
        />
      </div>
    );
  };

  if (showTutorial) {
    return (
      <div className="nldle-container">
        <div className="nldle-header">
          <h2 className="nldle-title">Welcome to NLDLE!</h2>
        </div>

        <div className="nldle-note">
          <h3 style={{ marginTop: 0 }}>How to Play</h3>
          <ol style={{ paddingLeft: '1.5rem', marginBottom: '1.5rem' }}>
            <li>You'll be shown two phrases from NL's videos</li>
            <li>Guess which phrase was said more frequently</li>
            <li>Each phrase shows when it was first mentioned</li>
            <li>Pay attention to context - words can have multiple meanings</li>
            <li>Try to maintain a streak of correct answers!</li>
          </ol>

          <div className="nldle-note">
            <p style={{ margin: 0 }}>
              <strong>Important Note:</strong> We are looking for <strong>exact phrase matches only</strong>. We are only looking for exact matches of the phrase in the exact order. <br></br>For example, if the phrase is 'Apple tree', it will only match 'Apple tree' and not 'apple grows in a big tree' because the words are broken up. Keep this in mind when choosing your answer.
            </p>
          </div>

          <button
            onClick={handleStartGame}
            className="nldle-button"
          >
            Start Game
          </button>
        </div>
      </div>
    );
  }

  if (gameOver) {
    return (
      <div className="nldle-container">
        <div className="nldle-header">
          <h2 className="nldle-title">Game Over!</h2>
          <p className="nldle-subtitle">Your final score: {score} out of {wordPairs.length}</p>
          <p className="nldle-subtitle">Best streak: {bestStreak}</p>
        </div>
        {renderProgressIndicator()}

        <div className="nldle-feedback">
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>How was your experience?</h3>
          <p style={{ marginBottom: '1rem', color: '#ccc' }}>
            We'd love to hear your thoughts on NLDLE! What did you like? What could be improved?
            Also, let me know if you think of any other pairs I should add, for now manually.
          </p>
          <textarea
            className="nldle-feedback-textarea"
            placeholder="Share your feedback..."
          />
          <button
            onClick={() => {
              const feedback = document.querySelector('textarea').value;
              if (feedback.trim()) {
                handleFeedbackSubmit(feedback);
              } else {
                alert('Please enter some feedback before submitting.');
              }
            }}
            className="nldle-button"
          >
            Submit Feedback
          </button>
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
          <button
            onClick={handlePlayAgain}
            className="nldle-button"
          >
            Play Again
          </button>
          <button
            onClick={handleBack}
            className="nldle-button secondary"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="nldle-container">
      <div className="nldle-header">
        <h2 className="nldle-title">NLDLE</h2>
        <p className="nldle-subtitle">Round {currentRound + 1} of {wordPairs.length}</p>
        <p className="nldle-subtitle">Score: {score}</p>
        {streak > 0 && (
          <p className="nldle-streak">
            🔥 Streak: {streak}
          </p>
        )}
      </div>

      <div className="nldle-note">
        <p style={{ margin: 0 }}>
          <strong>Note:</strong> These counts are based on exact term matches. For example, "cat" and "cats" are counted separately.
          This is only a prototype, and the counts are manually inputted, and only has these 5 pairs for now.
          Will build more soon, but for now, let me know what you think!
        </p>
      </div>

      {renderProgressIndicator()}
      {renderProgressBar()}

      <div style={{ marginTop: '2rem' }}>
        <h3 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>Which phrase was said more frequently?</h3>
        <div className="nldle-options">
          <button
            onClick={() => handleOptionSelect(1)}
            disabled={showResult}
            className={`nldle-option-button ${
              showResult
                ? selectedOption === 1
                  ? isCorrect
                    ? 'correct'
                    : 'incorrect'
                  : 'disabled'
                : ''
            }`}
          >
            <span>{wordPairs[currentRound].option1.text}</span>
            <span className="nldle-option-date">
              First seen: {wordPairs[currentRound].option1.earliestReference}
            </span>
          </button>
          <button
            onClick={() => handleOptionSelect(2)}
            disabled={showResult}
            className={`nldle-option-button ${
              showResult
                ? selectedOption === 2
                  ? isCorrect
                    ? 'correct'
                    : 'incorrect'
                  : 'disabled'
                : ''
            }`}
          >
            <span>{wordPairs[currentRound].option2.text}</span>
            <span className="nldle-option-date">
              First seen: {wordPairs[currentRound].option2.earliestReference}
            </span>
          </button>
        </div>
      </div>

      {showResult && (
        <div className={`nldle-result ${animateResult ? 'visible' : ''}`}>
          <p className={isCorrect ? 'nldle-result-correct' : 'nldle-result-incorrect'}>
            {isCorrect ? 'Correct!' : 'Incorrect!'}
          </p>
          <div className="nldle-result-container">
            <div className="nldle-result-card">
              <p>
                {wordPairs[currentRound].option1.text}: {wordPairs[currentRound].option1.count} times
                <br />
                <span className="nldle-option-date">
                  Earliest reference: {wordPairs[currentRound].option1.earliestReference}
                </span>
                <br />
                <a 
                  href={`https://nlquotes.com/search?q=${encodeURIComponent(wordPairs[currentRound].option1.text)}&channel=northernlion`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nldle-result-link"
                >
                  View search results
                </a>
              </p>
            </div>
            <div className="nldle-result-card">
              <p>
                {wordPairs[currentRound].option2.text}: {wordPairs[currentRound].option2.count} times
                <br />
                <span className="nldle-option-date">
                  Earliest reference: {wordPairs[currentRound].option2.earliestReference}
                </span>
                <br />
                <a 
                  href={`https://nlquotes.com/search?q=${encodeURIComponent(wordPairs[currentRound].option2.text)}&channel=northernlion`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nldle-result-link"
                >
                  View search results
                </a>
              </p>
            </div>
          </div>
          <button
            onClick={handleNextRound}
            className="nldle-button"
          >
            Next Round
          </button>
        </div>
      )}
    </div>
  );
};

export default NLDLE; 