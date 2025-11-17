

import React, { useState } from 'react';
import { ArrowLeftIcon, SpinnerIcon } from './Icons';

interface LoginPageProps {
    onAdminLogin: (email: string, pass: string) => Promise<{ success: boolean, error?: string }>;
    onCustomerLogin: (email: string, pass: string) => Promise<{ success: boolean, error?: string }>;
    onBackToHome: () => void;
}

type LoginMode = 'admin' | 'customer';

const LoginPage: React.FC<LoginPageProps> = ({ onAdminLogin, onCustomerLogin, onBackToHome }) => {
    // Shared State
    const [mode, setMode] = useState<LoginMode>('customer');
    const [errors, setErrors] = useState<{ [key: string]: string }>({});
    const [isLoading, setIsLoading] = useState(false);
    
    // Admin State
    const [email, setEmail] = useState('');
    const [adminPassword, setAdminPassword] = useState('');

    // Customer State
    const [phone, setPhone] = useState('');
    const [customerPassword, setCustomerPassword] = useState('');


    const handleModeChange = (newMode: LoginMode) => {
        setMode(newMode);
        // Reset all fields and errors on mode change
        setEmail('');
        setAdminPassword('');
        setPhone('');
        setCustomerPassword('');
        setErrors({});
        setIsLoading(false);
    };

    const handleAdminSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrors({});
        const newErrors: { [key: string]: string } = {};
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            newErrors.email = "Please enter a valid email address.";
        }
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }
        
        setIsLoading(true);
        const result = await onAdminLogin(email, adminPassword);
        if (!result.success) {
            setErrors({ form: result.error || 'An error occurred.' });
        }
        setIsLoading(false);
    };

    const handleCustomerLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrors({});
        if (!/^\d{10}$/.test(phone)) {
            setErrors({ phone: 'Please enter a valid 10-digit mobile number.' });
            return;
        }
        
        setIsLoading(true);
        const email = `${phone}@ssfarmorganic.local`;
        const result = await onCustomerLogin(email, customerPassword);
        if (!result.success) {
            setErrors({ form: result.error || 'Login failed. Please try again.' });
        }
        // On success, the App component will handle navigation
        setIsLoading(false);
    };
    

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col justify-center items-center p-4">
             <button onClick={onBackToHome} className="absolute top-4 left-4 flex items-center text-gray-600 hover:text-blue-600">
                <ArrowLeftIcon className="h-5 w-5 mr-2"/>
                Back to Home
            </button>
            <div className="max-w-md w-full bg-white rounded-lg shadow-md">
                <div className="flex border-b">
                    <button 
                        onClick={() => handleModeChange('admin')}
                        className={`w-1/2 py-4 text-center font-semibold transition-colors ${mode === 'admin' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        Admin/Staff Login
                    </button>
                    <button 
                        onClick={() => handleModeChange('customer')}
                        className={`w-1/2 py-4 text-center font-semibold transition-colors ${mode === 'customer' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        Customer Login
                    </button>
                </div>
                
                <div className="p-8">
                    <div className="text-center mb-8">
                        <img src="https://raw.githubusercontent.com/sravanaig/images/refs/heads/main/images/logo.png" alt="ssfarmorganic logo" className="h-12 w-12 mx-auto" />
                        <h2 className="mt-4 text-3xl font-bold text-gray-800">{mode === 'admin' ? 'Admin Login' : 'Customer Portal'}</h2>
                        <p className="text-gray-500">{mode === 'admin' ? 'Access your dashboard' : 'Login with your mobile and password'}</p>
                    </div>

                    {errors.form && (
                        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                            <span className="block sm:inline">{errors.form}</span>
                        </div>
                    )}

                    {mode === 'admin' ? (
                        <form onSubmit={handleAdminSubmit} className="space-y-6">
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email Address</label>
                                <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className={`mt-1 block w-full border ${errors.email ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm p-2`} />
                                {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
                            </div>
                            <div>
                                <label htmlFor="password"className="block text-sm font-medium text-gray-700">Password</label>
                                <input id="password" type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                            </div>
                            <button type="submit" disabled={isLoading} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                               {isLoading ? 'Signing in...' : 'Sign in'}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleCustomerLoginSubmit} className="space-y-6">
                            <div>
                                <label htmlFor="phone" className="block text-sm font-medium text-gray-700">10-Digit Mobile Number</label>
                                <div className="mt-1 flex">
                                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">+91</span>
                                    <input id="phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} required className={`flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border ${errors.phone ? 'border-red-500' : 'border-gray-300'}`} />
                                </div>
                                {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
                            </div>
                             <div>
                                <label htmlFor="customer-password"className="block text-sm font-medium text-gray-700">Password</label>
                                <input id="customer-password" type="password" value={customerPassword} onChange={e => setCustomerPassword(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                                <p className="mt-2 text-xs text-gray-500">Hint: Your default password is your 10-digit mobile number. For example: 9876543210</p>
                            </div>
                            <button type="submit" disabled={isLoading} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                               {isLoading ? <SpinnerIcon className="animate-spin h-5 w-5" /> : 'Login'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LoginPage;