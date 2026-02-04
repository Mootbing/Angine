import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format seconds into a human-readable duration like "5s", "10m", "2h", "3d"
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`
  }
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60)
    return `${mins}m`
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600)
    return `${hours}h`
  }
  const days = Math.floor(seconds / 86400)
  return `${days}d`
}

/**
 * Format seconds ago into a human-readable string like "5s ago", "10m ago"
 */
export function formatTimeAgo(seconds: number): string {
  return `${formatDuration(seconds)} ago`
}
