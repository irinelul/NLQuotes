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
        earliestReference: "08 July 2022" // Format: YYYY-MM-DD
      },
      option2: { 
        text: "watermelon ass", 
        count: 14,
        earliestReference: "13 July 2021"
      }
    },
    {
      option2: { 
        text: "kingston, ontario", 
        count: 148,
        earliestReference: "04 November 2010"
      },
      option1: { 
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

  const handleStartGame = () => {
    setShowTutorial(false);
  };

  const handleFeedbackSubmit = async (feedback) => {
    try {
      await query.flagQuote({
        quote: "NLDLE Feedback",
        searchTerm: "NLDLE Feedback",
        timestamp: "0",
        videoId: "nldle-feedback",
        title: "NLDLE Feedback",
        channel: "User Feedback",
        reason: feedback
      });
      alert('Thank you for your feedback!');
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

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  if (showTutorial) {
    return (
      <div style={{ maxWidth: 800, margin: '2rem auto', padding: '2rem', background: 'var(--surface-color)', borderRadius: 12 }}>
        <div style={{ 
          background: 'linear-gradient(135deg, #2196F3, #4CAF50)',
          padding: '2rem',
          borderRadius: '12px',
          marginBottom: '2rem',
          textAlign: 'center',
          color: 'white'
        }}>
          <h2 style={{ fontSize: '2.5rem', margin: 0 }}>Welcome to NLDLE!</h2>
        </div>

        <div style={{ 
          background: 'rgba(255,255,255,0.1)',
          padding: '1.5rem',
          borderRadius: '8px',
          marginBottom: '1.5rem'
        }}>
          <h3 style={{ marginTop: 0 }}>How to Play</h3>
          <ol style={{ paddingLeft: '1.5rem', marginBottom: '1.5rem' }}>
            <li>You'll be shown two phrases from NL's videos</li>
            <li>Guess which phrase was said more frequently</li>
            <li>Each phrase shows when it was first mentioned</li>
            <li>Pay attention to context - words can have multiple meanings</li>
            <li>Try to maintain a streak of correct answers!</li>
          </ol>

          <div style={{ 
            background: 'rgba(255,255,255,0.1)',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            fontSize: '0.9rem',
            color: '#ccc'
          }}>
            <p style={{ margin: 0 }}>
              <strong>Note:</strong> These counts are based on exact term matches. For example, "cat" and "cats" are counted separately.
              This is only a prototype, and the counts are manually inputted, and only has these 5 pairs for now.
              Will build more soon, but for now, let me know what you think!
            </p>
          </div>

          <button
            onClick={handleStartGame}
            style={{
              padding: '0.8rem 1.5rem',
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              transition: 'all 0.3s ease',
              boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
              width: '100%'
            }}
            onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
            onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
          >
            Start Game
          </button>
        </div>
      </div>
    );
  }

  if (gameOver) {
    return (
      <div style={{ maxWidth: 800, margin: '2rem auto', padding: '2rem', background: 'var(--surface-color)', borderRadius: 12 }}>
        <div style={{ 
          background: 'linear-gradient(135deg, #2196F3, #4CAF50)',
          padding: '2rem',
          borderRadius: '12px',
          marginBottom: '2rem',
          textAlign: 'center',
          color: 'white'
        }}>
          <h2 style={{ fontSize: '2.5rem', margin: 0 }}>Game Over!</h2>
          <p style={{ fontSize: '1.5rem', margin: '1rem 0' }}>Your final score: {score} out of {wordPairs.length}</p>
          <p style={{ fontSize: '1.2rem', margin: '0.5rem 0' }}>Best streak: {bestStreak}</p>
        </div>
        {renderProgressIndicator()}

        <div style={{ 
          background: 'rgba(255,255,255,0.1)',
          padding: '1.5rem',
          borderRadius: '8px',
          marginBottom: '1.5rem'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>How was your experience?</h3>
          <p style={{ marginBottom: '1rem', color: '#ccc' }}>
            We'd love to hear your thoughts on NLDLE! What did you like? What could be improved?
            Also, let me know if you think of any other pairs I should add, for now manually.
          </p>
          <textarea
            style={{
              width: '100%',
              padding: '0.8rem',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'white',
              fontSize: '1rem',
              marginBottom: '1rem',
              minHeight: '100px',
              resize: 'vertical'
            }}
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
            style={{
              padding: '0.8rem 1.5rem',
              background: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              transition: 'all 0.3s ease',
              boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
              width: '100%'
            }}
            onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
            onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
          >
            Submit Feedback
          </button>
        </div>

        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center', gap: '1rem' }}>
          <button
            onClick={handlePlayAgain}
            style={{
              padding: '0.8rem 1.5rem',
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              transition: 'all 0.3s ease',
              boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
            }}
            onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
            onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
          >
            Play Again
          </button>
          <button
            onClick={handleBack}
            style={{
              padding: '0.8rem 1.5rem',
              background: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              transition: 'all 0.3s ease',
              boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
            }}
            onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
            onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '2rem auto', padding: '2rem', background: 'var(--surface-color)', borderRadius: 12 }}>
      <div style={{ 
        background: 'linear-gradient(135deg, #2196F3, #4CAF50)',
        padding: '2rem',
        borderRadius: '12px',
        marginBottom: '2rem',
        textAlign: 'center',
        color: 'white'
      }}>
        <h2 style={{ fontSize: '2.5rem', margin: 0 }}>NLDLE</h2>
        <p style={{ fontSize: '1.2rem', margin: '0.5rem 0' }}>Round {currentRound + 1} of {wordPairs.length}</p>
        <p style={{ fontSize: '1.2rem', margin: '0.5rem 0' }}>Score: {score}</p>
        {streak > 0 && (
          <p style={{ fontSize: '1.2rem', margin: '0.5rem 0', color: '#4CAF50' }}>
            🔥 Streak: {streak}
          </p>
        )}
      </div>

      <div style={{ 
        background: 'rgba(255,255,255,0.1)',
        padding: '1rem',
        borderRadius: '8px',
        marginBottom: '1.5rem',
        fontSize: '0.9rem',
        color: '#ccc'
      }}>
        <p style={{ margin: 0 }}>
          <strong>Note:</strong> These counts are based on exact term matches. For example, "cat" and "cats" are counted separately.
          The earliest reference is the first time the phrase was said in a video, pay attention to the context, and how many meanings a word can have.
        </p>
      </div>

      {renderProgressIndicator()}
      {renderProgressBar()}

      <div style={{ marginTop: '2rem' }}>
        <h3 style={{ textAlign: 'center', fontSize: '1.5rem', marginBottom: '1.5rem' }}>Which phrase was said more frequently?</h3>
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem' }}>
          <button
            onClick={() => handleOptionSelect(1)}
            disabled={showResult}
            style={{
              flex: 1,
              padding: '1.5rem',
              background: showResult ? (selectedOption === 1 ? (isCorrect ? '#4CAF50' : '#f44336') : '#666') : '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: showResult ? 'default' : 'pointer',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              transition: 'all 0.3s ease',
              boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem'
            }}
            onMouseOver={(e) => !showResult && (e.target.style.transform = 'translateY(-2px)')}
            onMouseOut={(e) => !showResult && (e.target.style.transform = 'translateY(0)')}
          >
            <span>{wordPairs[currentRound].option1.text}</span>
            <span style={{ fontSize: '0.9rem', opacity: 0.8, fontStyle: 'italic' }}>
              First seen: {formatDate(wordPairs[currentRound].option1.earliestReference)}
            </span>
          </button>
          <button
            onClick={() => handleOptionSelect(2)}
            disabled={showResult}
            style={{
              flex: 1,
              padding: '1.5rem',
              background: showResult ? (selectedOption === 2 ? (isCorrect ? '#4CAF50' : '#f44336') : '#666') : '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: showResult ? 'default' : 'pointer',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              transition: 'all 0.3s ease',
              boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem'
            }}
            onMouseOver={(e) => !showResult && (e.target.style.transform = 'translateY(-2px)')}
            onMouseOut={(e) => !showResult && (e.target.style.transform = 'translateY(0)')}
          >
            <span>{wordPairs[currentRound].option2.text}</span>
            <span style={{ fontSize: '0.9rem', opacity: 0.8, fontStyle: 'italic' }}>
              First seen: {formatDate(wordPairs[currentRound].option2.earliestReference)}
            </span>
          </button>
        </div>
      </div>

      {showResult && (
        <div 
          style={{ 
            marginTop: '2rem', 
            textAlign: 'center',
            opacity: animateResult ? 1 : 0,
            transform: `translateY(${animateResult ? '0' : '20px'})`,
            transition: 'all 0.5s ease'
          }}
        >
          <p style={{ 
            color: isCorrect ? '#4CAF50' : '#f44336', 
            fontWeight: 'bold',
            fontSize: '1.5rem',
            marginBottom: '1rem'
          }}>
            {isCorrect ? 'Correct!' : 'Incorrect!'}
          </p>
          <div style={{ 
            display: 'flex',
            gap: '1.5rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{ 
              flex: 1,
              background: 'rgba(255,255,255,0.1)',
              padding: '1.5rem',
              borderRadius: '8px',
              textAlign: 'left'
            }}>
              <p style={{ marginBottom: '1rem' }}>
                {wordPairs[currentRound].option1.text}: {wordPairs[currentRound].option1.count} times
                <br />
                <span style={{ fontSize: '0.9rem', color: '#ccc', fontStyle: 'italic' }}>
                  Earliest reference: {formatDate(wordPairs[currentRound].option1.earliestReference)}
                </span>
                <br />
                <a 
                  href={`https://nlquotes.com/search?q=${encodeURIComponent(wordPairs[currentRound].option1.text)}&channel=northernlion`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ 
                    color: '#2196F3', 
                    textDecoration: 'none', 
                    fontSize: '0.9rem',
                    display: 'inline-block',
                    marginTop: '0.5rem',
                    padding: '0.3rem 0.8rem',
                    background: 'rgba(33, 150, 243, 0.1)',
                    borderRadius: '4px',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseOver={(e) => e.target.style.background = 'rgba(33, 150, 243, 0.2)'}
                  onMouseOut={(e) => e.target.style.background = 'rgba(33, 150, 243, 0.1)'}
                >
                  View search results
                </a>
              </p>
            </div>
            <div style={{ 
              flex: 1,
              background: 'rgba(255,255,255,0.1)',
              padding: '1.5rem',
              borderRadius: '8px',
              textAlign: 'left'
            }}>
              <p style={{ marginBottom: '1rem' }}>
                {wordPairs[currentRound].option2.text}: {wordPairs[currentRound].option2.count} times
                <br />
                <span style={{ fontSize: '0.9rem', color: '#ccc', fontStyle: 'italic' }}>
                  Earliest reference: {formatDate(wordPairs[currentRound].option2.earliestReference)}
                </span>
                <br />
                <a 
                  href={`https://nlquotes.com/search?q=${encodeURIComponent(wordPairs[currentRound].option2.text)}&channel=northernlion`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ 
                    color: '#2196F3', 
                    textDecoration: 'none', 
                    fontSize: '0.9rem',
                    display: 'inline-block',
                    marginTop: '0.5rem',
                    padding: '0.3rem 0.8rem',
                    background: 'rgba(33, 150, 243, 0.1)',
                    borderRadius: '4px',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseOver={(e) => e.target.style.background = 'rgba(33, 150, 243, 0.2)'}
                  onMouseOut={(e) => e.target.style.background = 'rgba(33, 150, 243, 0.1)'}
                >
                  View search results
                </a>
              </p>
            </div>
          </div>
          <button
            onClick={handleNextRound}
            style={{
              padding: '0.8rem 1.5rem',
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              transition: 'all 0.3s ease',
              boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
            }}
            onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
            onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
          >
            Next Round
          </button>
        </div>
      )}
    </div>
  );
};

export default NLDLE; 