require('dotenv').config();

const mongoose = require('mongoose')

mongoose.set('strictQuery', false)

const url = process.env.MONGODB_URI

mongoose.connect(url)

    .then(result => {
        console.log('connected to MongoDB')
    })
    .catch(error => {
        console.log('error connecting to MongoDB:', error.message)
    })

const noteSchema = new mongoose.Schema({
    name: {    type: String,    minLength: 5,    required: true  },
    number: {    type: String,    minLength: 8,    required: true ,
        validate:{validator: function(v) {return /^\d{2,3}-\d+$/.test(v);
            }} },
})

noteSchema.set('toJSON', {
    transform: (document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString()
        delete returnedObject._id
        delete returnedObject.__v
    }
})


module.exports = mongoose.model('Person', noteSchema)