import dotenv from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;
import readline from 'readline';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function getPhraseStats(phrase) {
  const client = await pool.connect();
  try {
    // Get count and earliest reference
    const result = await client.query(`
      WITH phrase_stats AS (
        SELECT 
          COUNT(*) as count,
          MIN(upload_date) as earliest_date
        FROM quotes
        WHERE fts_doc @@ websearch_to_tsquery('simple', $1)
        AND text ILIKE $2
        AND channel_source = 'Northernlion'
      )
      SELECT 
        count,
        TO_CHAR(earliest_date, 'DD Month YYYY') as earliest_reference
      FROM phrase_stats
    `, [phrase, `%${phrase}%`]);

    return {
      count: result.rows[0]?.count || 0,
      earliestReference: result.rows[0]?.earliest_reference || 'Unknown'
    };
  } finally {
    client.release();
  }
}

function printGameData(gameData) {
  console.log('\n=== NLDLE Game Data ===');
  console.log('Word Pairs:');
  gameData.wordPairs.forEach((pair, index) => {
    console.log(`\nPair ${index + 1}:`);
    console.log('Option 1:');
    console.log(`  Text: "${pair.option1.text}"`);
    console.log(`  Count: ${pair.option1.count}`);
    console.log(`  First Seen: ${pair.option1.earliestReference}`);
    console.log('\nOption 2:');
    console.log(`  Text: "${pair.option2.text}"`);
    console.log(`  Count: ${pair.option2.count}`);
    console.log(`  First Seen: ${pair.option2.earliestReference}`);
    console.log('\n---');
  });
}

async function addNLDLEGame() {
  const client = await pool.connect();
  try {
    // Get date from user
    const date = await new Promise((resolve) => {
      rl.question('Enter game date (YYYY-MM-DD) or press enter for today: ', (answer) => {
        resolve(answer || new Date().toISOString().split('T')[0]);
      });
    });

    // Get number of pairs
    const numPairs = await new Promise((resolve) => {
      rl.question('How many word pairs? ', (answer) => {
        resolve(parseInt(answer) || 5);
      });
    });

    const wordPairs = [];

    // Get each pair
    for (let i = 0; i < numPairs; i++) {
      console.log(`\nPair ${i + 1}:`);
      
      // Get first option
      const option1Text = await new Promise((resolve) => {
        rl.question('First phrase: ', resolve);
      });
      console.log('Fetching stats for first phrase...');
      const option1Stats = await getPhraseStats(option1Text);
      console.log(`Found ${option1Stats.count} occurrences`);
      console.log(`First seen on ${option1Stats.earliestReference}`);

      // Get second option
      const option2Text = await new Promise((resolve) => {
        rl.question('Second phrase: ', resolve);
      });
      console.log('Fetching stats for second phrase...');
      const option2Stats = await getPhraseStats(option2Text);
      console.log(`Found ${option2Stats.count} occurrences`);
      console.log(`First seen on ${option2Stats.earliestReference}`);

      wordPairs.push({
        option1: {
          text: option1Text,
          count: option1Stats.count,
          earliestReference: option1Stats.earliestReference
        },
        option2: {
          text: option2Text,
          count: option2Stats.count,
          earliestReference: option2Stats.earliestReference
        }
      });

      console.log('\nPair Summary:');
      console.log(`${option1Text}: ${option1Stats.count} times, first seen ${option1Stats.earliestReference}`);
      console.log(`${option2Text}: ${option2Stats.count} times, first seen ${option2Stats.earliestReference}`);
      console.log('---');
    }

    // Create the game data
    const gameData = { wordPairs };

    // Insert into database
    await client.query(`
      INSERT INTO nldle_games (game_date, game_data)
      VALUES ($1, $2)
      ON CONFLICT (game_date) DO UPDATE
      SET game_data = $2, updated_at = CURRENT_TIMESTAMP;
    `, [date, gameData]);

    console.log('\nGame added successfully!');
    printGameData(gameData);

  } catch (error) {
    console.error('Error adding game:', error);
  } finally {
    client.release();
    rl.close();
    await pool.end();
  }
}

// Run the script
addNLDLEGame(); 