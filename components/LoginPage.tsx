import React, { useState } from 'react';
import { MilkIcon, ArrowLeftIcon } from './Icons';

interface LoginPageProps {
    onLogin: (email: string, pass: string) => Promise<{ success: boolean, error?: string }>;
    onSignUp: (email: string, pass: string) => Promise<{ success: boolean, error?: string }>;
    onBackToHome: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onSignUp, onBackToHome }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');
        setIsLoading(true);

        if (isSignUp) {
            const result = await onSignUp(email, password);
            if (result.success) {
                setSuccessMessage('Sign up successful! Please check your email for a confirmation link, then you can log in.');
                setIsSignUp(false); // Switch back to login view
            } else {
                setError(result.error || 'An unknown error occurred during sign up.');
            }
        } else {
            const result = await onLogin(email, password);
            if (!result.success) {
                setError(result.error || 'Invalid email or password.');
            }
        }
        setIsLoading(false);
    };

    const toggleMode = () => {
        setIsSignUp(!isSignUp);
        setError('');
        setSuccessMessage('');
        setEmail('');
        setPassword('');
    }

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col justify-center items-center p-4">
             <button onClick={onBackToHome} className="absolute top-4 left-4 flex items-center text-gray-600 hover:text-blue-600">
                <ArrowLeftIcon className="h-5 w-5 mr-2"/>
                Back to Home
            </button>
            <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
                <div className="text-center mb-8">
                    <MilkIcon className="h-12 w-12 text-blue-600 mx-auto"/>
                    <h2 className="mt-4 text-3xl font-bold text-gray-800">{isSignUp ? 'Create Admin Account' : 'Admin Login'}</h2>
                    <p className="text-gray-500">{isSignUp ? 'Set up your credentials' : 'Access your dashboard'}</p>
                </div>

                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                        <span className="block sm:inline">{error}</span>
                    </div>
                )}
                
                {successMessage && !error && (
                    <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-4" role="alert">
                        <span className="block sm:inline">{successMessage}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email Address</label>
                        <div className="mt-1">
                            <input
                                id="email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="password"className="block text-sm font-medium text-gray-700">Password</label>
                        <div className="mt-1">
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete={isSignUp ? "new-password" : "current-password"}
                                required
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            />
                        </div>
                    </div>
                    
                    <div>
                        <button type="submit" disabled={isLoading} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
                           {isLoading ? (isSignUp ? 'Signing up...' : 'Signing in...') : (isSignUp ? 'Sign up' : 'Sign in')}
                        </button>
                    </div>
                </form>

                 <p className="mt-6 text-center text-sm text-gray-600">
                    {isSignUp ? 'Already have an account?' : "Don't have an account?"}
                    {' '}
                    <button onClick={toggleMode} className="font-medium text-blue-600 hover:text-blue-500">
                        {isSignUp ? 'Sign in' : 'Sign up'}
                    </button>
                </p>
            </div>
        </div>
    );
};

export default LoginPage;
