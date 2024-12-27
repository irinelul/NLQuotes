import dotenv from 'dotenv';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import quote from './models/mongodb.js';
dotenv.config();

const app = express();
const PORT = process.env.PORT;

app.use(cors());
app.use(express.json());
app.use(express.static('dist'));

morgan.token('body', (req) => JSON.stringify(req.body));
morgan.token('bodyLength', (req) => (JSON.stringify(req.body)).length);
app.use(morgan(':method :url  status :status - :response-time ms content: :body :bodyLength Length  :res[header]'));

app.get('/api', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const strict = req.query.strict === 'true';
    const searchTerm = strict ? `\\b${req.query.searchTerm}\\b` : req.query.searchTerm || ''; 
    console.log(strict, searchTerm);

    quote.aggregate([
        {
            $search: {
                index: "default", // Specify your search index
                phrase: {
                    query: searchTerm, // The search term (e.g., 'brain chip')
                    path: "text" // The field you're searching in
                }
            }
        },
        { 
            $group: { 
                _id: "$video_id", 
                video_id: { $first: "$video_id" }, 
                quotes: { 
                    $push: { 
                        text: "$text", 
                        line_number: "$line_number", 
                        timestamp_start: "$timestamp_start", 
                        title: "$title" 
                    } 
                } 
            } 
        },
        { $skip: skip },
        { $limit: limit }
    ])
    
    .then(result => {
        res.json({ data: result });
    })
    .catch(error => res.status(500).send({ error: 'Something went wrong' }));
});

app.get('/stats', (req, res) => {
    try {
        quote.distinct("video_id")
        .then(distinctVideoIds => {
            const count = distinctVideoIds.length;
            res.json({ data: count });
        })
    } catch (error) {
        res.status(500).send({ error: 'Failed to fetch stats' });
    }
});


// app.get('/stats', async (req, res) => {
//     try {
//         // Fetch distinct video IDs and their channel_source counts
//         const channelSourceCounts = await quote.aggregate([
//             {
//                 $group: {
//                     _id: "$channel_source", // Group by channel_source
//                     total: { $sum: 1 }     // Count occurrences
//                 }
//             }
//         ]);

//         // Format the response for clarity
//         const result = channelSourceCounts.map(item => ({
//             channel_source: item._id,
//             count: item.total
//         }));

//         res.json({ data: result });
//     } catch (error) {
//         res.status(500).send({ error: 'Failed to fetch stats' });
//     }
// });


app.get('/info', (req, res) => {
    Person.find({}).then(person => {
        res.send(`Phonebook has info for ${person.length} persons <br> Info is correct as of  ${new Date().toISOString()}`);
    });
});

const errorHandler = (error, req, res, next) => {
    console.error(error.message);
    if (error.name === 'CastError') {
        return res.status(400).send({ error: 'malformatted id' });
    } else if (error.name === 'ValidationError') {
        return res.status(400).json({ error: error.message });
    }
    next(error);
};

app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
