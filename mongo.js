const mongoose = require('mongoose')
require('dotenv').config();

const url = process.env.MONGODB_URI


if (process.argv.length<3) {
    console.log('give password as argument')
    process.exit(1)
}

mongoose.set('strictQuery',false)

mongoose.connect(url)

const noteSchema = new mongoose.Schema({
    name: String,
    phone: String,
})

const Person = mongoose.model('Person', noteSchema)

if((process.argv.length)<4) {
    Person.find({}).then(result => {
        result.forEach(note => {
            console.log("phonebook")
            console.log(note.name,note.phone)
        })
        mongoose.connection.close()
    })}
else {
    const note = new Person({
        name: process.argv[3],
        phone: process.argv[4],
    })

    note.save().then(result => {
        console.log(`added ${process.argv[3]} number ${process.argv[4]} to phonebook `)
        mongoose.connection.close()
    })
}