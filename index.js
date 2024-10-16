require('dotenv').config();

const express = require('express')
const morgan = require('morgan')
const app = express()
const cors = require('cors')
const Person = require('./models/note')



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



app.get('/', (req, res) => {
  Person.find({}).then(person => {
    response.json(person)
  })
  })


app.get('/api/persons', (request, response) => {
  Person.find({}).then(person => {
    response.json(person)
  })
})


app.get('/api/persons/:id', (request, response,next ) => {
  Person.findById(request.params.id)
      .then(note => {
        if (note) {
          response.json(note)
        } else {
          response.status(404).end()
        }
      })
      .catch(error => next(error))
})



app.post('/api/persons', (request, response,next) => {
  const body = request.body
  // if (!body.name || !body.number) {
  //   console.log('content missing. We require both body and number to be populated')
  //   return response.status(400).json({
  //     error: 'content missing. We require both body and number to be populated.'
  //   })
  // }
  // if (persons.find(p=>p.name.toLowerCase()===body.name.toLowerCase())) {
  //   return response.status(400).json({
  //     error: `${body.name} already exists in the phonebook.
  //     The name must be unique.`
  //   })
  // }
  const note = new Person({
    name: body.name,
    number: body.number,
  })
  note.save().then(savedNote => {
    response.json(savedNote)
  })
      .catch(error => next(error))
})




app.get('/info', (request, response) => {
  Person.find({}).then(person => {
    response.send(`Phonebook has info for ${person.length} persons <br>
    Info is correct as of  ${new Date().toISOString()}`   )
  })
})



app.put('/api/persons/:id', (request, response,next) => {
  const {name,number}=request.body

  Person.findByIdAndUpdate(request.params.id,{name,number},{ new: true, runValidators: true, context: 'query' })
      .then(updatedPerson => {response.json(updatedPerson)})
      .catch(error=>next(error))
})



app.delete('/api/persons/:id', (request, response,next) => {
  Person.findByIdAndDelete(request.params.id)
      .then(result => {
        response.status(204).end()
      })
      .catch(error => next(error))
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