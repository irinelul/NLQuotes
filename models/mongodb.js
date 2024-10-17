import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config();
mongoose.set('strictQuery', false)

const url = process.env.MONGODB_URI

mongoose.connect(url)

    .then(result => {
        console.log('connected to MongoDB')
    })
    .catch(error => {
        console.log('error connecting to MongoDB:', error.message)
    })

const quoteSchema = new mongoose.Schema({
    _id: {    type: String},
    video_id: {    type: String},
    line_number: {    type: String},
    timestamp_start: {    type: String},
    timestamp_end: {    type: String},
    text: { type: String},
})


export default mongoose.model('quote', quoteSchema);