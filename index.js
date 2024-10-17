import dotenv from 'dotenv';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import Quote from './models/mongodb.js';
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
    const searchTerm = req.query.searchTerm || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 15;
    const skip = (page - 1) * limit;

    Quote.find({ text: { $regex: searchTerm, $options: 'i' } })
        .skip(skip)
        .limit(limit)
        .then(result => {
            Person.countDocuments({ name: { $regex: searchTerm, $options: 'i' } })
                .then(count => {
                    res.json({
                        data: result,
                        currentPage: page,
                        totalPages: Math.ceil(count / limit),
                        totalItems: count
                    });
                });
        })
        .catch(error => res.status(500).send({ error: 'Something went wrong' }));
});

app.get('/stats', async (req, res) => {
    try {
        const totalVideosPromise = Person.distinct('video_id').then(ids => ids.length);
        const totalQuotesPromise = Person.countDocuments({ text: { $ne: null } });
        const [totalVideos, totalQuotes] = await Promise.all([totalVideosPromise, totalQuotesPromise]);

        res.json({ totalVideos, totalQuotes });
    } catch (error) {
        res.status(500).send({ error: 'Failed to fetch stats' });
    }
});

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
