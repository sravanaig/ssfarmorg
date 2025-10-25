import React from 'react';
import { LeafIcon } from './Icons';
import type { WebsiteContent } from '../types';

interface ProductsPageProps {
    content: WebsiteContent['productsPage'];
}

const ProductsPage: React.FC<ProductsPageProps> = ({ content }) => {
    return (
        <div className="bg-gray-50">
            <div className="container mx-auto px-6 py-16">
                <div className="text-center mb-16">
                    <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight">
                        {content.title}
                    </h1>
                    <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
                        {content.subtitle}
                    </p>
                </div>

                <div className="space-y-20">
                    {content.products.map((product, index) => (
                        <div key={product.name} className={`grid md:grid-cols-2 gap-12 items-center ${index % 2 !== 0 ? 'md:grid-flow-col-dense' : ''}`}>
                            <div className={index % 2 !== 0 ? 'md:col-start-2' : ''}>
                                <img src={product.image} alt={product.name} className="rounded-lg shadow-2xl w-full h-auto object-cover aspect-video" />
                            </div>
                            <div className={`text-center md:text-left ${index % 2 !== 0 ? 'md:col-start-1' : ''}`}>
                                <h2 className="text-3xl font-bold text-gray-800 mb-4">{product.name}</h2>
                                <p className="text-gray-600 mb-6">{product.description}</p>
                                <ul className="space-y-2">
                                    {product.benefits.map(benefit => (
                                        <li key={benefit} className="flex items-start">
                                            <LeafIcon className="h-5 w-5 mr-3 text-green-500 flex-shrink-0 mt-1" />
                                            <span className="text-gray-700">{benefit}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ProductsPage;