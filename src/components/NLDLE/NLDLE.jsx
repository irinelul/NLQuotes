import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import query from '../../services/quotes';
import { formatDate } from '../../services/dateHelpers';
import './NLDLE.css';

const NLDLE = () => {
  const NLDLE_DISABLED = true;
  const navigate = useNavigate();
  const handleBack = () => {
    navigate('/');
  };
  if (NLDLE_DISABLED) {
    return (
      <div className="nldle-container">
        <div className="nldle-header">
          <h2 className="nldle-title">NLDLE</h2>
        </div>
        <div className="nldle-note" style={{ marginTop: '2rem', fontSize: '1.2rem', textAlign: 'center' }}>
          NLDLE is currently being reworked to come up with better phrases and a sustaining way to generate games. Thank you for trying it out and providing valuable feedback, all inputs are noted and will be kept in mind.
        </div>
        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center' }}>
          <button onClick={handleBack} className="nldle-button secondary">Go Back</button>
        </div>
      </div>
    );
  }

  const [currentRound, setCurrentRound] = useState(0);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [roundResults, setRoundResults] = useState(Array(5).fill(null));
  const [animateResult, setAnimateResult] = useState(false);
  const [showTutorial, setShowTutorial] = useState(true);
  const [streak, setStreak] = useState(() => {
    const savedStreak = localStorage.getItem('nldleStreak');
    return savedStreak ? parseInt(savedStreak) : 0;
  });
  const [bestStreak, setBestStreak] = useState(() => {
    const savedBestStreak = localStorage.getItem('nldleBestStreak');
    return savedBestStreak ? parseInt(savedBestStreak) : 0;
  });
  const [wordPairs, setWordPairs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [gameDate, setGameDate] = useState(new Date());
  const [lastPlayedDate, setLastPlayedDate] = useState(() => {
    const savedDate = localStorage.getItem('nldleLastPlayedDate');
    return savedDate ? new Date(savedDate) : null;
  });

  useEffect(() => {
    let isMounted = true;
    let isFetching = false;

    const fetchGameData = async () => {
      if (isFetching) return;
      isFetching = true;

      try {
        setLoading(true);
        console.log('Fetching game data...');
        const response = await fetch('/api/nldle');
        console.log('Response status:', response.status);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Failed to fetch game data' }));
          throw new Error(errorData.error || 'Failed to fetch game data');
        }
        
        const data = await response.json();
        console.log('Received data:', data);
        
        if (isMounted) {
          if (data.game_data && data.game_data.wordPairs) {
            setWordPairs(data.game_data.wordPairs);
            if (data.game_date) {
              setGameDate(new Date(data.game_date));
            }
          } else {
            throw new Error('Invalid game data format');
          }
        }
      } catch (err) {
        console.error('Error fetching game data:', err);
        if (isMounted) {
          setError(err.message || 'Failed to load game data. Please try again later.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
        isFetching = false;
      }
    };

    fetchGameData();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleStartGame = () => {
    setShowTutorial(false);
  };

  const handleOptionSelect = (option) => {
    setSelectedOption(option);
    const currentPair = wordPairs[currentRound];
    console.log('Current pair:', currentPair);
    const count1 = parseInt(currentPair.option1.count);
    const count2 = parseInt(currentPair.option2.count);
    console.log('Option 1 count:', count1);
    console.log('Option 2 count:', count2);
    const isCorrectAnswer = option === (count1 > count2 ? 1 : 2);
    console.log('Selected option:', option);
    console.log('Is correct answer:', isCorrectAnswer);
    setIsCorrect(isCorrectAnswer);
    setShowResult(true);
    setAnimateResult(true);
    
    // Update round results
    const newRoundResults = [...roundResults];
    newRoundResults[currentRound] = isCorrectAnswer;
    setRoundResults(newRoundResults);
    
    if (isCorrectAnswer) {
      setScore(score + 1);
      // Only update streak if this is the last round and we got a perfect score
      if (currentRound === wordPairs.length - 1 && score + 1 === wordPairs.length) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Only update streaks if we haven't played today
        if (!lastPlayedDate || lastPlayedDate.getTime() !== today.getTime()) {
          const newStreak = streak + 1;
          setStreak(newStreak);
          localStorage.setItem('nldleStreak', newStreak.toString());
          
          // Update best streak if we beat our historical best
          if (newStreak > bestStreak) {
            setBestStreak(newStreak);
            localStorage.setItem('nldleBestStreak', newStreak.toString());
          }
          
          // Save today's date
          setLastPlayedDate(today);
          localStorage.setItem('nldleLastPlayedDate', today.toISOString());
        }
      } else if (currentRound === wordPairs.length - 1) {
        // If we reach the end without a perfect score, reset the streak
        setStreak(0);
        localStorage.setItem('nldleStreak', '0');
      }
    } else {
      setStreak(0);
      localStorage.setItem('nldleStreak', '0');
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
    // Don't reset streak here since we want to persist it
  };

  const handleCopyResults = () => {
    const squares = roundResults.map(result => result === true ? '🟩 ' : '🟪 ').join('');
    
    const date = new Date();
    const day = date.getDate();
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();
    const formattedDate = `${day} ${month} ${year}`;
    
    const resultText = `NLdle Results:
Score: ${score}/${wordPairs.length}
Best Streak: ${bestStreak} 
${squares}
${formattedDate}
https://nlquotes.com/nldle`;

    navigator.clipboard.writeText(resultText)
      .then(() => {
        alert('Results copied to clipboard!');
      })
      .catch(err => {
        console.error('Failed to copy results:', err);
        alert('Failed to copy results. Please try again.');
      });
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

  if (loading) {
    return (
      <div className="nldle-container">
        <div className="nldle-header">
          <h2 className="nldle-title">Loading NLDLE...</h2>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="nldle-container">
        <div className="nldle-header">
          <h2 className="nldle-title">Error</h2>
          <p className="nldle-subtitle">{error}</p>
          <button onClick={() => window.location.reload()} className="nldle-button">
            Try Again
          </button>
        </div>
      </div>
    );
  }

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
          <div style={{ marginTop: '1rem', marginBottom: '2rem' }}>
            <p className="nldle-subtitle" style={{ marginBottom: '0.5rem' }}>Your final score: {score} out of {wordPairs.length}</p>
            {bestStreak > 0 && (
              <p className="nldle-subtitle" style={{ marginBottom: '0.5rem' }}>Historical Best Streak: {bestStreak} 🔥</p>
            )}
            {streak > 0 && (
              <p className="nldle-subtitle" style={{ marginBottom: '0.5rem' }}>Current Streak: {streak} 🔥</p>
            )}
          </div>
        </div>
        {renderProgressIndicator()}

        <div className="nldle-feedback" style={{ marginTop: '2rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}><strong>Thank you for playing!</strong> How was your experience?</h3>
          <p style={{ marginBottom: '1rem', color: '#ccc' }}>
            We'd love to hear your thoughts on NLDLE! What did you like? What could be improved?<br></br>
            Also, let me know if you think of any other pairs I should add, for now manually.
          </p>
          <textarea
            className="nldle-feedback-textarea"
            placeholder="Share your feedback..."
            style={{ marginBottom: '1rem' }}
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
            style={{ marginBottom: '2rem' }}
          >
            Submit Feedback
          </button>
        </div>

        <div style={{ 
          marginTop: '2rem', 
          display: 'flex', 
          gap: '1rem',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
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
          <button
            onClick={handleCopyResults}
            className="nldle-button"
            style={{ backgroundColor: '#4CAF50' }}
          >
            Copy Results
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
        <p className="nldle-subtitle">Game Date: {formatDate(gameDate)}</p>
        {streak > 0 && (
          <p className="nldle-streak">
            🔥 Current Streak: {streak}
          </p>
        )}
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
                  href={`https://nlquotes.com/search?q=%22${encodeURIComponent(wordPairs[currentRound].option1.text)}%22&channel=northernlion`}
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
                  href={`https://nlquotes.com/search?q=%22${encodeURIComponent(wordPairs[currentRound].option2.text)}%22&channel=northernlion`}
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