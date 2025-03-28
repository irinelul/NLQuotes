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
    title: { type: String},
    channel_source: { type: String},
    upload_date: { type: Date},
    game_name: { type: String}
})

// Add index for game_name
quoteSchema.index({ game_name: 1 });

// Add compound indexes for common filter combinations
quoteSchema.index({ channel_source: 1, game_name: 1 });
quoteSchema.index({ channel_source: 1, upload_date: 1 });
quoteSchema.index({ game_name: 1, upload_date: 1 });
quoteSchema.index({ channel_source: 1, game_name: 1, upload_date: 1 });

export default mongoose.model('quote', quoteSchema);