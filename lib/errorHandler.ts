

export const getFriendlyErrorMessage = (error: any): string => {
  if (!error) {
    return 'An unknown error occurred.';
  }

  // Case 1: Error is already a string.
  if (typeof error === 'string') {
    return error;
  }
  
  // Case 2: Error is an object. Extract a message string if possible.
  // We check for common properties where error messages are stored.
  // Safely handle cases where message properties might be objects themselves.
  let message = error.message || error.details || error.error_description;
  
  if (typeof message === 'object') {
      try {
          message = JSON.stringify(message);
      } catch (e) {
          // Fallback if circular reference or other issue
          message = String(message); 
      }
  }

  if (typeof message === 'string' && message.trim() !== '') {
    const lowerCaseMessage = message.toLowerCase();

    // Add user-friendly interpretations for common technical errors.
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
    
    // If no specific friendly message matches, return the original message.
    return message;
  }

  // Case 3: Fallback for all other complex/unknown error objects.
  // Log the original error for debugging but show a generic message to the user.
  console.error("An error occurred with a non-standard message format:", error);
  
  // Try to return JSON representation if possible for debugging
  try {
      return JSON.stringify(error);
  } catch (e) {
      return 'An unexpected error occurred. Please check the console for more details.';
  }
};
