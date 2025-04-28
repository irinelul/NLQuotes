import dotenv from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

async function initNLDLE() {
  const client = await pool.connect();
  try {
    // Create table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS nldle_games (
        id SERIAL PRIMARY KEY,
        game_date DATE NOT NULL UNIQUE,
        game_data JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_nldle_games_date ON nldle_games(game_date);
    `);

    // Insert sample data for today
    const today = new Date().toISOString().split('T')[0];
    const sampleData = {
      wordPairs: [
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
        }
      ]
    };

    await client.query(`
      INSERT INTO nldle_games (game_date, game_data)
      VALUES ($1, $2)
      ON CONFLICT (game_date) DO UPDATE
      SET game_data = $2, updated_at = CURRENT_TIMESTAMP;
    `, [today, sampleData]);

    console.log('NLDLE table initialized successfully');
  } catch (error) {
    console.error('Error initializing NLDLE table:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

initNLDLE(); 