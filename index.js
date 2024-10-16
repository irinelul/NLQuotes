require('dotenv').config();

const express = require('express')
const morgan = require('morgan')
const app = express()
const cors = require('cors')
const Person = require('./models/mongodb')

app.use(express.static('dist'))
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})

morgan.token('body', (req) => JSON.stringify(req.body));
morgan.token('bodyLength', (req) =>  (JSON.stringify(req.body)).length) ;


app.use(morgan(':method :url  status :status - :response-time ms content: :body :bodyLength Length  :res[header]'))



app.get('/api', (req, res) => {
    const searchTerm = req.query.searchTerm || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 15;
    const skip = (page - 1) * limit;
    Person.find({ text: { $regex: searchTerm, $options: 'i' } })
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



app.get('/info', (request, response) => {
    Person.find({}).then(person => {
        response.send(`Phonebook has info for ${person.length} persons <br>
    Info is correct as of  ${new Date().toISOString()}`   )
    })
})


const errorHandler = (error, request, response, next) => {
    console.error(error.message)

    if (error.name === 'CastError') {
        console.error(error.message)

        return response.status(400).send({ error: 'malformatted id' })

    } else if (error.name === 'ValidationError') {
        console.log('phone number not correct type')
        return response.status(400).json({ error: error.message })
    }
    // else if(error.name==='Person validation failed'){
    //   console.log('phone number not correct type')
    //   return response.status(400).json({ error:'phone number not correct type' })
    // }

    next(error)
}

app.use(errorHandler)