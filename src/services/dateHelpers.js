import { format } from 'date-fns';

export const backdateTimestamp = (timestamp) => {
    return Math.max(0, Math.floor(timestamp) - 1);
}

export const formatDate = (date) => {
    if (!date) return 'N/A';

    // If it's already a Date object
    if (date instanceof Date) {
        return format(date, 'dd MMMM yyyy');
    }

    // If it's a string in YYYYMMDD format
    if (typeof date === 'string' && date.length === 8) {
        const dateObj = new Date(
            date.slice(0, 4),  // Year
            date.slice(4, 6) - 1, // Month (0-indexed)
            date.slice(6, 8) // Day
        );
        return format(dateObj, 'dd MMMM yyyy');
    }

    // If it's an ISO string or other date string
    try {
        const dateObj = new Date(date);
        return format(dateObj, 'dd MMMM yyyy');
    } catch (e) {
        return 'Invalid Date';
    }
};

export const formatTimestamp = (seconds) => {
    if (!seconds || isNaN(seconds)) return '00:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    const pad = (num) => num.toString().padStart(2, '0');

    if (hours > 0) {
        return `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}`;
    }
    return `${pad(minutes)}:${pad(remainingSeconds)}`;
};