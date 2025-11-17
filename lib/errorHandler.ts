export const getFriendlyErrorMessage = (error: any): string => {
  if (!error) {
    return 'An unknown error occurred.';
  }

  let message: string;

  if (typeof error.message === 'string' && error.message.trim() !== '') {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else {
    // This handles cases where error is an object without a message, or an empty message
    console.error("An error occurred with a non-standard message format:", error);
    message = 'An unexpected error occurred. Please check the console for more details.';
  }
  
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

  // Return the original, non-lowercased message if no specific friendly message was found.
  return message;
};
