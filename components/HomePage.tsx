

import React, { useState, useEffect } from 'react';
import type { WebsiteContent } from '../types';
// Fix: Removed MilkIcon as it does not exist in './Icons'. Also removed other unused icons.
import { CheckIcon, TruckIcon, DashboardIcon, UsersIcon, HeartIcon, BarnIcon, QuoteIcon, ChevronDownIcon, ChevronUpIcon } from './Icons';

interface HomePageProps {
  content: WebsiteContent;
}

type Product = WebsiteContent['productsPage']['products'][0];

const ProductCard: React.FC<{ product: Product; icon: string }> = ({ product, icon }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const detailsToShow = [];
    if (product.feed) detailsToShow.push({ title: 'Organic Feed', text: product.feed });
    if (product.extraction) detailsToShow.push({ title: 'Hygienic Extraction', text: product.extraction });
    if (product.process) detailsToShow.push({ title: 'Crafting Process', text: product.process });

    return (
        <div className="bg-white p-8 rounded-lg shadow-md flex flex-col transition-all duration-300">
            <div className="text-5xl mb-4 text-center">{icon}</div>
            <h3 className="text-xl font-bold mb-2 text-center">{product.name}</h3>
            <p className="text-gray-600 text-justify flex-grow">{product.description}</p>
            {detailsToShow.length > 0 && (
                <div className="mt-6">
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="w-full flex justify-center items-center px-4 py-2 text-sm font-semibold text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
                    >
                        {isExpanded ? 'Show Less' : 'Learn More'}
                        {isExpanded ? <ChevronUpIcon className="h-4 w-4 ml-2" /> : <ChevronDownIcon className="h-4 w-4 ml-2" />}
                    </button>
                    {isExpanded && (
                        <div className="mt-4 space-y-4 border-t pt-4 text-left">
                            {detailsToShow.map(detail => (
                                <div key={detail.title}>
                                    <h4 className="font-semibold text-gray-800">{detail.title}</h4>
                                    <p className="text-gray-600 text-sm text-justify">{detail.text}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};


const HomePage: React.FC<HomePageProps> = ({ content }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  
  useEffect(() => {
    const slideInterval = setInterval(() => {
        setCurrentSlide(prevSlide => (prevSlide + 1) % content.heroSlides.length);
    }, 5000); // Change slide every 5 seconds

    return () => clearInterval(slideInterval);
  }, [content.heroSlides.length]);

  return (
      <main>
        {/* Hero Banner Slider */}
        <section className="relative h-[60vh] w-full overflow-hidden text-white">
            <div
                className="flex transition-transform duration-700 ease-in-out h-full"
                style={{ transform: `translateX(-${currentSlide * 100}%)` }}
            >
                {content.heroSlides.map((slide, index) => (
                    <div 
                        key={index} 
                        className="w-full flex-shrink-0 h-full bg-cover bg-center relative"
                        style={{ backgroundImage: `url(${slide.image})` }}
                    >
                        <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center text-center p-4">
                            <div className="container mx-auto px-6">
                                <h1 className="text-4xl md:text-5xl font-extrabold leading-tight">
                                    {slide.title}
                                </h1>
                                <p className="mt-4 text-lg text-gray-200 max-w-2xl mx-auto">
                                    {slide.subtitle}
                                </p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex space-x-2 z-10">
                {content.heroSlides.map((_, index) => (
                    <button
                        key={index}
                        onClick={() => setCurrentSlide(index)}
                        className={`w-3 h-3 rounded-full transition-colors ${currentSlide === index ? 'bg-white' : 'bg-gray-300 bg-opacity-50 hover:bg-gray-200'}`}
                        aria-label={`Go to slide ${index + 1}`}
                    ></button>
                ))}
            </div>
        </section>
        
        {/* Our Story Section */}
        <section id="about" className="py-20 bg-gray-50">
            <div className="container mx-auto px-6 text-center">
                <h2 className="text-3xl font-bold text-gray-800 mb-16">{content.ourStory.title}</h2>
                <div className="relative max-w-5xl mx-auto">
                    {/* Connecting line for desktop */}
                    <div className="absolute top-10 left-0 w-full h-0.5 bg-gray-200 hidden md:block" aria-hidden="true"></div>

                    <div className="grid md:grid-cols-4 gap-8 relative">
                        {content.ourStory.steps.map((step, index) => {
                           const icons = [
                                <HeartIcon className="h-10 w-10" />,
                                <UsersIcon className="h-10 w-10" />,
                                <BarnIcon className="h-10 w-10" />,
                                <TruckIcon className="h-10 w-10" />
                            ];
                            const colors = ['bg-blue-100 text-blue-600', 'bg-green-100 text-green-600', 'bg-yellow-100 text-yellow-600', 'bg-purple-100 text-purple-600'];
                           return (
                             <div key={index} className="flex flex-col items-center p-4">
                                <div className={`flex items-center justify-center h-20 w-20 rounded-full mx-auto mb-4 z-10 border-4 border-gray-50 ${colors[index % colors.length]}`}>
                                    {icons[index % icons.length]}
                                </div>
                                <h4 className="font-semibold text-lg mb-2">{step.title}</h4>
                                <p className="text-gray-600 text-sm">{step.text}</p>
                            </div>
                           );
                        })}
                    </div>
                </div>
            </div>
        </section>

        {/* About Our Dairy Farm Section */}
        <section className="py-16 bg-green-50">
            <div className="container mx-auto px-6">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-bold text-gray-800 mt-2 mb-4">{content.dairyFarm.title}</h2>
                    <p className="text-gray-600 max-w-3xl mx-auto">
                       {content.dairyFarm.text}
                    </p>
                </div>
                <div className="grid md:grid-cols-2 gap-12 items-center">
                    <div>
                         <img src="https://risingnepaldaily.com/storage/media/26906/murra-1.jpg" alt="Our healthy buffaloes at the dairy farm" className="rounded-lg shadow-lg"/>
                    </div>
                    <div className="mt-8 md:mt-0">
                        <h3 className="text-2xl font-semibold text-gray-800 mb-6 text-center md:text-left">Our Process of Purity</h3>
                        <ol className="relative border-l border-gray-200">
                            <li className="mb-10 ml-6">
                                <span className="absolute flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full -left-4 ring-8 ring-white text-lg">🐄</span>
                                <h4 className="font-semibold text-gray-900">Extracting Milk</h4>
                                <p className="text-sm text-gray-600">Gently extracted from our healthy, stress-free buffaloes using hygienic, modern methods.</p>
                            </li>
                            <li className="mb-10 ml-6">
                                <span className="absolute flex items-center justify-center w-8 h-8 bg-green-100 rounded-full -left-4 ring-8 ring-white text-lg">🔬</span>
                                <h4 className="font-semibold text-gray-900">Filtering &amp; Purity Testing</h4>
                                <p className="text-sm text-gray-600">The milk is filtered to remove impurities and tested for quality to ensure it meets our high standards.</p>
                            </li>
                            <li className="mb-10 ml-6">
                                <span className="absolute flex items-center justify-center w-8 h-8 bg-yellow-100 rounded-full -left-4 ring-8 ring-white text-lg">🍼</span>
                                <h4 className="font-semibold text-gray-900">Hygienic Packing</h4>
                                <p className="text-sm text-gray-600">Immediately chilled and packed into sealed, sterile bottles to lock in freshness and nutrients.</p>
                            </li>
                            <li className="mb-10 ml-6">
                                <span className="absolute flex items-center justify-center w-8 h-8 bg-purple-100 rounded-full -left-4 ring-8 ring-white text-lg">❄️</span>
                                <h4 className="font-semibold text-gray-900">Cold Storage</h4>
                                <p className="text-sm text-gray-600">Stored in a controlled, cold environment to maintain its purity until it's ready for delivery.</p>
                            </li>
                            <li className="ml-6">
                                <span className="absolute flex items-center justify-center w-8 h-8 bg-red-100 rounded-full -left-4 ring-8 ring-white text-lg">🚚</span>
                                <h4 className="font-semibold text-gray-900">Doorstep Delivery</h4>
                                <p className="text-sm text-gray-600">Our reliable delivery team brings the fresh, chilled milk straight to your home every morning.</p>
                            </li>
                        </ol>
                    </div>
                </div>
            </div>
        </section>

        {/* Why Choose Us Section */}
        <section className="py-16">
          <div className="container mx-auto px-6">
            <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-gray-800">{content.whyChooseUs.title}</h2>
                <p className="mt-2 text-gray-600">{content.whyChooseUs.subtitle}</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                {content.whyChooseUs.features.map((feature, index) => {
                    const icons = [
                        <CheckIcon className="h-8 w-8" />,
                        <TruckIcon className="h-8 w-8" />,
                        <DashboardIcon className="h-8 w-8" />,
                        <UsersIcon className="h-8 w-8" />
                    ];
                    const colors = ['bg-blue-100 text-blue-600', 'bg-green-100 text-green-600', 'bg-yellow-100 text-yellow-600', 'bg-purple-100 text-purple-600'];
                    return (
                        <div key={index} className="text-center p-4">
                            <div className={`flex items-center justify-center h-16 w-16 rounded-full mx-auto mb-4 ${colors[index % colors.length]}`}>
                                {icons[index % icons.length]}
                            </div>
                            <h4 className="font-semibold text-lg">{feature.title}</h4>
                            <p className="text-gray-600">{feature.text}</p>
                        </div>
                    );
                })}
            </div>
          </div>
        </section>

        {/* Products Section */}
        <section id="products" className="py-16 bg-gray-50">
            <div className="container mx-auto px-6 text-center">
                <h2 className="text-3xl font-bold text-gray-800">{content.productsSection.title}</h2>
                <p className="mt-2 text-gray-600 mb-12">{content.productsSection.subtitle}</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {content.productsPage.products.map((product, index) => {
                        const icons = ['🥛', '🐄', '🧀'];
                        return <ProductCard key={index} product={product} icon={icons[index % icons.length]} />;
                    })}
                </div>
            </div>
        </section>

        {/* Testimonials Section */}
        <section id="testimonials" className="py-16 bg-white">
          <div className="container mx-auto px-6 text-center">
            <h2 className="text-3xl font-bold text-gray-800">{content.testimonials.title}</h2>
            <p className="mt-2 text-gray-600 mb-12">{content.testimonials.subtitle}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {content.testimonials.list.map((testimonial, index) => (
                  <div key={index} className="bg-gray-50 p-8 rounded-lg shadow-sm text-left relative">
                    <QuoteIcon className="absolute top-4 left-4 h-8 w-8 text-gray-200" />
                    <p className="text-gray-600 italic mt-8 mb-4">"{testimonial.quote}"</p>
                    <div className="flex items-center">
                      <img src={`https://ui-avatars.com/api/?name=${testimonial.name.replace(' ', '+')}&background=e0f2fe&color=0284c7`} alt="Customer avatar" className="w-12 h-12 rounded-full mr-4" />
                      <div>
                        <p className="font-semibold text-gray-800">{testimonial.name}</p>
                        <p className="text-sm text-gray-500">{testimonial.role}</p>
                      </div>
                    </div>
                  </div>
              ))}
            </div>
          </div>
        </section>
        
        {/* Meet our Founders */}
        <section id="team" className="py-16 bg-gray-50">
            <div className="container mx-auto px-6 text-center">
                <h2 className="text-3xl font-bold text-gray-800">{content.founders.title}</h2>
                <p className="mt-2 text-gray-600 mb-12">{content.founders.subtitle}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                    {content.founders.list.map((founder, index) => (
                         <div key={index} className="bg-white p-8 rounded-lg shadow-sm">
                            <img src={`https://ui-avatars.com/api/?name=${founder.name.replace(' ', '+')}&background=dbeafe&color=2563eb&size=96`} alt={`Founder ${founder.name}`} className="w-24 h-24 rounded-full mx-auto mb-4" />
                            <h3 className="text-xl font-bold">{founder.name}</h3>
                            <p className="text-blue-600 font-semibold mb-2">{founder.title}</p>
                            <p className="text-gray-600 text-justify">{founder.bio}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
      </main>
  );
};

export default HomePage;
