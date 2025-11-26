
import React, { useState, useEffect } from 'react';
import { MenuIcon, XIcon, WhatsAppIcon } from './Icons';
import type { Page } from '../App';
import EnquiryModal from './EnquiryModal';
import { supabase } from '../lib/supabaseClient';

interface SharedLayoutProps {
    children: React.ReactNode;
    onLoginClick: () => void;
    onNavigate: (page: Page) => void;
}

const SharedLayout: React.FC<SharedLayoutProps> = ({ children, onLoginClick, onNavigate }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isEnquiryModalOpen, setIsEnquiryModalOpen] = useState(false);
    const [visitCount, setVisitCount] = useState<number | null>(null);
    
    useEffect(() => {
        const incrementVisit = async () => {
            try {
                // Check if we already counted this session to avoid spamming increments on navigation
                const hasCounted = sessionStorage.getItem('visit_counted');
                
                if (!hasCounted) {
                    const { data, error } = await supabase.rpc('increment_visitor_count');
                    if (!error && data) {
                        setVisitCount(data);
                        sessionStorage.setItem('visit_counted', 'true');
                    } else {
                        // Fallback if RPC fails (e.g. table doesn't exist yet)
                        console.warn("Could not increment visitor count:", error);
                    }
                } else {
                    // Just fetch current count
                    const { data, error } = await supabase.from('website_stats').select('value').eq('name', 'total_visits').single();
                    if (data) setVisitCount(data.value);
                }
            } catch (e) {
                console.warn("Visitor count error:", e);
            }
        };
        incrementVisit();
    }, []);

    const handleNavClick = (page: 'home' | 'products', sectionId?: string) => {
        setIsMenuOpen(false);
        if (currentPageIs(page) && sectionId) {
            document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
        } else {
            onNavigate(page);
            if (sectionId) {
                setTimeout(() => {
                    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
            }
        }
    };

    const currentPageIs = (page: 'home' | 'products') => {
        // A simple way to check the current page without a full router
        return window.location.pathname.endsWith(page) || (page === 'home' && window.location.pathname.endsWith('/'));
    }

    return (
        <div className="bg-white text-gray-800 font-sans">
            <header className="bg-white shadow-sm sticky top-0 z-50">
                <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
                <button onClick={() => handleNavClick('home')} className="flex items-center space-x-2">
                    <img src="https://raw.githubusercontent.com/sravanaig/images/refs/heads/main/images/logo.png" alt="ssfarmorganic logo" className="h-8 w-8" />
                    <span className="text-xl font-bold text-gray-800">ssfarmorganic</span>
                </button>
                
                {/* Desktop Nav */}
                <div className="hidden md:flex items-center space-x-6">
                    <button onClick={() => handleNavClick('home', 'about')} className="text-gray-600 hover:text-blue-600 transition-colors">About Us</button>
                    <button onClick={() => handleNavClick('products')} className="text-gray-600 hover:text-blue-600 transition-colors">Products</button>
                    <button onClick={() => handleNavClick('home', 'testimonials')} className="text-gray-600 hover:text-blue-600 transition-colors">Testimonials</button>
                    <button onClick={() => handleNavClick('home', 'team')} className="text-gray-600 hover:text-blue-600 transition-colors">Our Team</button>
                    <button onClick={onLoginClick} className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-transform transform hover:scale-105">
                        Login
                    </button>
                </div>

                {/* Mobile Nav Button */}
                <div className="md:hidden">
                    <button onClick={() => setIsMenuOpen(true)} aria-label="Open menu">
                        <MenuIcon className="h-6 w-6 text-gray-800"/>
                    </button>
                </div>
                </nav>

                {/* Mobile Menu */}
                <div className={`fixed inset-0 bg-white z-50 transform ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'} transition-transform duration-300 ease-in-out md:hidden`}>
                    <div className="flex justify-end p-6">
                        <button onClick={() => setIsMenuOpen(false)} aria-label="Close menu">
                            <XIcon className="h-6 w-6 text-gray-800"/>
                        </button>
                    </div>
                    <div className="flex flex-col items-center justify-center h-full -mt-16 space-y-8">
                        <button onClick={() => handleNavClick('home', 'about')} className="text-2xl text-gray-800 hover:text-blue-600">About Us</button>
                        <button onClick={() => handleNavClick('products')} className="text-2xl text-gray-800 hover:text-blue-600">Products</button>
                        <button onClick={() => handleNavClick('home', 'testimonials')} className="text-2xl text-gray-800 hover:text-blue-600">Testimonials</button>
                        <button onClick={() => handleNavClick('home', 'team')} className="text-2xl text-gray-800 hover:text-blue-600">Our Team</button>
                        <button onClick={() => { onLoginClick(); setIsMenuOpen(false); }} className="mt-8 px-8 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-700">
                            Login
                        </button>
                    </div>
                </div>
            </header>
            
            {children}

            {/* Floating WhatsApp Enquiry Button */}
            <button
                onClick={() => setIsEnquiryModalOpen(true)}
                className="fixed bottom-6 right-6 bg-green-500 text-white p-4 rounded-full shadow-lg hover:bg-green-600 transition-transform transform hover:scale-110 z-40"
                aria-label="Send an enquiry on WhatsApp"
            >
                <WhatsAppIcon className="h-8 w-8" />
            </button>
            
            {/* Enquiry Modal */}
            <EnquiryModal
                isOpen={isEnquiryModalOpen}
                onClose={() => setIsEnquiryModalOpen(false)}
            />
            
            <footer className="bg-gray-800 text-white">
                <div className="container mx-auto px-6 py-10">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left">
                    <div>
                    <div className="flex items-center justify-center md:justify-start space-x-2 mb-4">
                        <img src="https://raw.githubusercontent.com/sravanaig/images/refs/heads/main/images/logo.png" alt="ssfarmorganic logo" className="h-8 w-8" />
                        <span className="text-xl font-bold">ssfarmorganic</span>
                    </div>
                    <p className="text-gray-400">Delivering pure, farm-fresh milk and happiness to your doorstep every day.</p>
                    </div>
                    <div>
                    <h4 className="font-semibold text-lg mb-4">Quick Links</h4>
                    <ul className="space-y-2 text-gray-400">
                        <li><button onClick={() => handleNavClick('home', 'about')} className="hover:text-white">About Us</button></li>
                        <li><button onClick={() => handleNavClick('products')} className="hover:text-white">Products</button></li>
                        <li><button onClick={() => handleNavClick('home', 'testimonials')} className="hover:text-white">Testimonials</button></li>
                    </ul>
                    </div>
                    <div>
                    <h4 className="font-semibold text-lg mb-4">Contact</h4>
                    <ul className="space-y-2 text-gray-400">
                        <li><a href="#" className="hover:text-white">ssfarmorganic, Medipally, Hyderabad</a></li>
                        <li><a href="tel:7382601453" className="hover:text-white">7382601453</a></li>
                        <li><a href="mailto:ssfarmorg@gmail.com" className="hover:text-white">ssfarmorg@gmail.com</a></li>
                    </ul>
                    </div>
                </div>
                <div className="border-t border-gray-700 mt-8 pt-6 text-center">
                    <p className="text-gray-500 text-sm">&copy; {new Date().getFullYear()} ssfarmorganic. All rights reserved 2025.</p>
                    {visitCount !== null && (
                        <p className="text-gray-600 text-xs mt-2 font-mono">Visitor Count: {visitCount.toLocaleString()}</p>
                    )}
                </div>
                </div>
            </footer>
        </div>
    );
};

export default SharedLayout;
