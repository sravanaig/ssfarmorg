
import React, { useState, useEffect } from 'react';
import { MilkIcon, ChevronLeftIcon, ChevronRightIcon } from './Icons';

const slides = [
  { title: "Fresh & Organic Milk", subtitle: "Delivered to your doorstep every morning.", color: "bg-blue-500" },
  { title: "Pure Buffalo Milk", subtitle: "Rich, creamy, and full of nutrients.", color: "bg-indigo-500" },
  { title: "Healthy Cow Milk", subtitle: "Light, nutritious, and easy to digest.", color: "bg-green-500" },
  { title: "Homemade Paneer", subtitle: "Soft, delicious, and made from pure milk.", color: "bg-yellow-500" },
  { title: "Subscribe & Save", subtitle: "Get regular deliveries and great discounts.", color: "bg-pink-500" },
];

const products = [
    { name: "Buffalo Milk", description: "Our organic buffalo milk is thick, creamy, and perfect for making traditional sweets, yogurt, or just enjoying a wholesome glass.", image: "🥛" },
    { name: "Cow Milk", description: "Sourced from grass-fed cows, our organic cow milk is a nutritious choice for the whole family, packed with calcium and vitamins.", image: "🐄" },
    { name: "Paneer (Cottage Cheese)", description: "Made fresh daily from our pure milk, this organic paneer is soft and spongy, ideal for all your favorite dishes.", image: "🧀" },
];

interface HomePageProps {
    onLoginClick: () => void;
}

const HomePage: React.FC<HomePageProps> = ({ onLoginClick }) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = () => {
    setCurrentSlide(prev => (prev === slides.length - 1 ? 0 : prev + 1));
  };

  const prevSlide = () => {
    setCurrentSlide(prev => (prev === 0 ? slides.length - 1 : prev - 1));
  };
  
  useEffect(() => {
    const slideInterval = setInterval(nextSlide, 5000);
    return () => clearInterval(slideInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-gray-50 min-h-screen">
      <header className="bg-white shadow-md sticky top-0 z-10">
        <nav className="container mx-auto px-6 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-2">
              <MilkIcon className="h-8 w-8 text-blue-600"/>
              <a className="text-xl font-bold text-gray-800" href="#">ssfatmorganic</a>
          </div>
          <button onClick={onLoginClick} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
            Admin Login
          </button>
        </nav>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative w-full h-96 text-white overflow-hidden">
           <div className="w-full h-full flex transition-transform ease-out duration-500" style={{ transform: `translateX(-${currentSlide * 100}%)` }}>
              {slides.map((slide, index) => (
                  <div key={index} className={`w-full h-full flex-shrink-0 flex items-center justify-center text-center ${slide.color} p-4`}>
                      <div>
                          <h1 className="text-4xl md:text-5xl font-bold">{slide.title}</h1>
                          <p className="mt-2 text-lg md:text-xl">{slide.subtitle}</p>
                      </div>
                  </div>
              ))}
           </div>
           
           <button onClick={prevSlide} className="absolute top-1/2 left-4 transform -translate-y-1/2 bg-black bg-opacity-50 p-2 rounded-full focus:outline-none">
              <ChevronLeftIcon className="h-6 w-6"/>
           </button>
           <button onClick={nextSlide} className="absolute top-1/2 right-4 transform -translate-y-1/2 bg-black bg-opacity-50 p-2 rounded-full focus:outline-none">
              <ChevronRightIcon className="h-6 w-6"/>
           </button>

           <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex space-x-2">
                {slides.map((_, index) => (
                    <button key={index} onClick={() => setCurrentSlide(index)} className={`w-3 h-3 rounded-full ${currentSlide === index ? 'bg-white' : 'bg-white/50'}`}></button>
                ))}
           </div>
        </section>

        {/* Products Section */}
        <section className="py-12 md:py-20 bg-white">
          <div className="container mx-auto px-6">
            <h2 className="text-3xl font-bold text-center text-gray-800 mb-8">Our Organic Products</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {products.map(product => (
                    <div key={product.name} className="bg-gray-50 rounded-lg shadow-lg p-6 text-center hover:shadow-xl transition-shadow">
                        <div className="text-6xl mb-4">{product.image}</div>
                        <h3 className="text-xl font-semibold text-gray-800 mb-2">{product.name}</h3>
                        <p className="text-gray-600">{product.description}</p>
                    </div>
                ))}
            </div>
          </div>
        </section>
        
        {/* About Section */}
        <section className="py-12 md:py-20 bg-gray-50">
           <div className="container mx-auto px-6 text-center">
             <h2 className="text-3xl font-bold text-gray-800 mb-4">Why Choose Us?</h2>
             <p className="text-gray-600 max-w-3xl mx-auto">
               We are committed to providing the freshest, purest, and most delicious dairy products. Our milk comes from happy, healthy animals that are raised ethically without any hormones or antibiotics. We believe in organic farming practices to bring you and your family the best nature has to offer.
             </p>
           </div>
        </section>
      </main>

      <footer className="bg-gray-800 text-white py-4">
        <div className="container mx-auto px-6 text-center">
          <p>&copy; {new Date().getFullYear()} ssfatmorganic. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;