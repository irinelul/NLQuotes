-- Create nldle_games table
CREATE TABLE IF NOT EXISTS nldle_games (
    id SERIAL PRIMARY KEY,
    game_date DATE NOT NULL UNIQUE,
    game_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on game_date for faster lookups
CREATE INDEX IF NOT EXISTS idx_nldle_games_date ON nldle_games(game_date);

-- Add trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_nldle_games_updated_at
    BEFORE UPDATE ON nldle_games
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data
INSERT INTO nldle_games (game_date, game_data) VALUES 
(CURRENT_DATE, '{
    "wordPairs": [
        {
            "option1": {
                "text": "salmonella and campylobacter",
                "count": 52,
                "earliestReference": "08 July 2022"
            },
            "option2": {
                "text": "watermelon ass",
                "count": 14,
                "earliestReference": "13 July 2021"
            }
        },
        {
            "option1": {
                "text": "kingston, ontario",
                "count": 148,
                "earliestReference": "04 November 2010"
            },
            "option2": {
                "text": "ontario, canada",
                "count": 34,
                "earliestReference": "04 November 2010"
            }
        }
    ]
}'::jsonb)
ON CONFLICT (game_date) DO NOTHING; 