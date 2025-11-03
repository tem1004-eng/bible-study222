import { ReadingStatus } from '../types';

const TRACKER_STORAGE_KEY = 'bibleReadingStatus';

export function getReadingStatus(): ReadingStatus {
  try {
    const status = localStorage.getItem(TRACKER_STORAGE_KEY);
    return status ? JSON.parse(status) : {};
  } catch (error) {
    console.error("Failed to parse reading status from localStorage", error);
    return {};
  }
}

export function markChapterAsRead(book: string, chapter: string) {
  try {
    const status = getReadingStatus();
    if (!status[book]) {
      status[book] = {};
    }
    status[book][chapter] = true;
    localStorage.setItem(TRACKER_STORAGE_KEY, JSON.stringify(status));
  } catch (error) {
     console.error("Failed to save reading status to localStorage", error);
  }
}

export function toggleChapterReadStatus(book: string, chapter: string) {
  try {
    const status = getReadingStatus();
    if (!status[book]) {
      status[book] = {};
    }
    
    if (status[book][chapter]) {
      // It's read, so mark as unread by deleting
      delete status[book][chapter];
      // Clean up empty book object
      if (Object.keys(status[book]).length === 0) {
        delete status[book];
      }
    } else {
      // It's unread, so mark as read
      status[book][chapter] = true;
    }

    localStorage.setItem(TRACKER_STORAGE_KEY, JSON.stringify(status));
  } catch (error) {
     console.error("Failed to save reading status to localStorage", error);
  }
}

export function isChapterRead(status: ReadingStatus, book: string, chapter: string): boolean {
    return !!(status[book] && status[book][chapter]);
}