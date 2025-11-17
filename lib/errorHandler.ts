export const getFriendlyErrorMessage = (error: any): string => {
  if (!error) {
    return 'An unknown error occurred.';
  }

  // Case 1: Error is already a reasonably-sized string
  if (typeof error === 'string') {
    return error;
  }
  
  // Case 2: Error is an object with a 'message' property that is a string
  if (error && typeof error.message === 'string' && error.message.trim() !== '') {
    const message = error.message;
    const lowerCaseMessage = message.toLowerCase();

    if (lowerCaseMessage.includes('failed to fetch')) {
        return 'Network error: Could not connect to the database. Please check your internet connection and ensure your Supabase configuration in lib/supabaseClient.ts is correct.';
    }
    if (lowerCaseMessage.includes('unique constraint')) {
        return 'This item already exists or conflicts with an existing entry. Please use a unique value.';
    }
    if (lowerCaseMessage.includes('rls') || lowerCaseMessage.includes('row level security') || lowerCaseMessage.includes('policy')) {
        return 'Permission denied. Your current role does not have access to perform this action.';
    }
    if (lowerCaseMessage.includes('jwt') || lowerCaseMessage.includes('token') || lowerCaseMessage.includes('invalid claim')) {
        return 'Authentication error. Your session may have expired. Please log out and log back in.';
    }
    if (lowerCaseMessage.includes('invalid login credentials')) {
        return 'Invalid mobile number or password. Please check your credentials and try again.';
    }
    if (lowerCaseMessage.includes('unsupported phone provider')) {
        return 'Configuration Error: The SMS provider (e.g., Twilio) is not set up correctly in the Supabase project settings. Please contact the administrator.';
    }
    
    return message;
  }

  // Case 3: Fallback for all other complex/unknown error objects
  console.error("An error occurred with a non-standard message format:", error);
  return 'An unexpected error occurred. Please check the console for more details.';
};
