export const getFriendlyErrorMessage = (error: any): string => {
  if (!error) {
    return 'An unknown error occurred.';
  }

  const message = (error.message || String(error)).toLowerCase();

  if (message.includes('failed to fetch')) {
    return 'Network error: Could not connect to the database. Please check your internet connection and ensure your Supabase configuration in lib/supabaseClient.ts is correct.';
  }
  if (message.includes('unique constraint')) {
    return 'This item already exists or conflicts with an existing entry. Please use a unique value.';
  }
  if (message.includes('rls') || message.includes('row level security') || message.includes('policy')) {
      return 'Permission denied. Your current role does not have access to perform this action.';
  }
  if (message.includes('jwt') || message.includes('token') || message.includes('invalid claim')) {
      return 'Authentication error. Your session may have expired. Please log out and log back in.';
  }

  // Return the original message for other errors
  return error.message || 'An unexpected error occurred.';
};
