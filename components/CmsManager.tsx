import React, { useState, useEffect } from 'react';
import type { WebsiteContent } from '../types';
import { supabase } from '../lib/supabaseClient';
import { GoogleGenAI } from '@google/genai';
import { ChevronDownIcon, ChevronUpIcon, SparklesIcon, SpinnerIcon } from './Icons';

interface CmsManagerProps {
    content: WebsiteContent | null;
    setContent: React.Dispatch<React.SetStateAction<WebsiteContent | null>>;
}

const CollapsibleSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="border border-gray-200 rounded-lg mb-4">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center p-4 bg-gray-50 hover:bg-gray-100">
                <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
                {isOpen ? <ChevronUpIcon className="h-5 w-5 text-gray-600" /> : <ChevronDownIcon className="h-5 w-5 text-gray-600" />}
            </button>
            {isOpen && <div className="p-4 border-t">{children}</div>}
        </div>
    );
};

const CmsManager: React.FC<CmsManagerProps> = ({ content, setContent }) => {
    const [formData, setFormData] = useState<WebsiteContent | null>(content);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'success' | 'error' | null>(null);
    const [generatingImageIndex, setGeneratingImageIndex] = useState<number | null>(null);

    useEffect(() => {
        setFormData(content);
    }, [content]);
    
    if (!formData) {
        return <div className="text-center p-8">Loading content editor...</div>;
    }

    const handleInputChange = (section: keyof WebsiteContent, field: string, value: any, index?: number, subField?: string, subIndex?: number) => {
        setFormData(prev => {
            if (!prev) return null;
            const newState = structuredClone(prev);
    
            if (index !== undefined) {
                // @ts-ignore
                const arrayToUpdate = field ? newState[section][field] : newState[section];
    
                if (!Array.isArray(arrayToUpdate) || arrayToUpdate[index] === undefined) {
                    console.error("Target for array update is not an array or index is out of bounds.", { section, field, index });
                    return prev;
                }
    
                if (subField) {
                    const item = arrayToUpdate[index];
                    if (typeof item === 'object' && item !== null) {
                        if (subIndex !== undefined && Array.isArray((item as any)[subField])) {
                            (item as any)[subField][subIndex] = value;
                        } else {
                            (item as any)[subField] = value;
                        }
                    }
                } else {
                    arrayToUpdate[index] = value;
                }
            } else if (field) {
                // @ts-ignore
                newState[section][field] = value;
            } else {
                // @ts-ignore
                newState[section] = value;
            }
    
            return newState;
        });
    };
    
    const handleSave = async () => {
        setIsSaving(true);
        setSaveStatus(null);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const { error } = await supabase
                .from('website_content')
                .update({ content: formData })
                .eq('userId', user.id);

            if (error) throw error;
            
            setContent(formData);
            setSaveStatus('success');
        } catch (error: any) {
            console.error("Error saving content:", error);
            setSaveStatus('error');
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveStatus(null), 3000);
        }
    };

    const handleGenerateImage = async (index: number) => {
        if (!formData) return;
        setGeneratingImageIndex(index);
        try {
            const slide = formData.heroSlides[index];
            if (!slide) throw new Error("Slide data not found.");

            const prompt = `A photorealistic, high-quality, vibrant, and welcoming image for a website banner for an organic milk delivery company called 'ssfarmorganic'. The main theme is "${slide.title}". The feeling should be fresh, natural, and wholesome, conveying the message: "${slide.subtitle}". Style: Cinematic, bright lighting, sharp focus.`;
            
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: prompt,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/jpeg',
                    aspectRatio: '16:9',
                },
            });

            if (response.generatedImages && response.generatedImages.length > 0) {
                const base64ImageBytes = response.generatedImages[0].image.imageBytes;
                const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
                handleInputChange('heroSlides', '', imageUrl, index, 'image');
            } else {
                throw new Error("No image was generated by the API.");
            }
        } catch (error) {
            console.error("Error generating image:", error);
            alert("Sorry, there was an error generating the image. Please check your API key and try again.");
        } finally {
            setGeneratingImageIndex(null);
        }
    };
    
    // Helper for rendering form fields
    const renderField = (label: string, value: string, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void, isTextArea = false) => (
        <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            {isTextArea ? (
                <textarea value={value} onChange={onChange} rows={4} className="w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500" />
            ) : (
                <input type="text" value={value} onChange={onChange} className="w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500" />
            )}
        </div>
    );
    
    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800">Website Content</h2>
                <button onClick={handleSave} disabled={isSaving} className="px-6 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-wait">
                    {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
            {saveStatus === 'success' && <div className="mb-4 p-3 bg-green-100 text-green-800 border border-green-200 rounded-md">Content saved successfully!</div>}
            {saveStatus === 'error' && <div className="mb-4 p-3 bg-red-100 text-red-800 border border-red-200 rounded-md">Failed to save content. Please try again.</div>}
            
            <CollapsibleSection title="Hero Banner Slides">
                {formData.heroSlides.map((slide, index) => (
                    <div key={index} className="p-4 border rounded-md mb-4 bg-gray-50">
                        <h4 className="font-semibold mb-2">Slide {index + 1}</h4>
                        {renderField('Title', slide.title, (e) => handleInputChange('heroSlides', '', e.target.value, index, 'title'))}
                        {renderField('Subtitle', slide.subtitle, (e) => handleInputChange('heroSlides', '', e.target.value, index, 'subtitle'))}
                        {renderField('Image URL', slide.image, (e) => handleInputChange('heroSlides', '', e.target.value, index, 'image'))}
                        <div className="mt-2">
                            <button
                                type="button"
                                onClick={() => handleGenerateImage(index)}
                                disabled={generatingImageIndex !== null}
                                className="flex items-center px-4 py-2 text-sm bg-purple-600 text-white rounded-lg shadow-sm hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-wait"
                            >
                                {generatingImageIndex === index ? (
                                    <>
                                        <SpinnerIcon className="h-4 w-4 mr-2 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="h-4 w-4 mr-2" />
                                        Generate with AI
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                ))}
            </CollapsibleSection>

            <CollapsibleSection title="Products Page">
                {renderField('Page Title', formData.productsPage.title, (e) => handleInputChange('productsPage', 'title', e.target.value))}
                {renderField('Page Subtitle', formData.productsPage.subtitle, (e) => handleInputChange('productsPage', 'subtitle', e.target.value))}
                {formData.productsPage.products.map((product, index) => (
                     <div key={index} className="p-4 border rounded-md mb-2 bg-gray-50">
                         <h4 className="font-semibold mb-2">Product {index + 1}</h4>
                         {renderField('Name', product.name, (e) => handleInputChange('productsPage', 'products', e.target.value, index, 'name'))}
                         {renderField('Description', product.description, (e) => handleInputChange('productsPage', 'products', e.target.value, index, 'description'), true)}
                         <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Benefits (one per line)</label>
                            <textarea 
                                value={product.benefits.join('\n')}
                                onChange={(e) => handleInputChange('productsPage', 'products', e.target.value.split('\n'), index, 'benefits')}
                                rows={4}
                                className="w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        {renderField('Image URL', product.image, (e) => handleInputChange('productsPage', 'products', e.target.value, index, 'image'))}
                     </div>
                ))}
            </CollapsibleSection>
            
            <CollapsibleSection title="Testimonials">
                {renderField('Section Title', formData.testimonials.title, (e) => handleInputChange('testimonials', 'title', e.target.value))}
                {renderField('Section Subtitle', formData.testimonials.subtitle, (e) => handleInputChange('testimonials', 'subtitle', e.target.value))}
                {formData.testimonials.list.map((item, index) => (
                    <div key={index} className="p-4 border rounded-md mb-2 bg-gray-50">
                        <h4 className="font-semibold mb-2">Testimonial {index + 1}</h4>
                        {renderField('Quote', item.quote, (e) => handleInputChange('testimonials', 'list', e.target.value, index, 'quote'), true)}
                        {renderField('Name', item.name, (e) => handleInputChange('testimonials', 'list', e.target.value, index, 'name'))}
                        {renderField('Role', item.role, (e) => handleInputChange('testimonials', 'list', e.target.value, index, 'role'))}
                    </div>
                ))}
            </CollapsibleSection>
            
            <CollapsibleSection title="Founders Section">
                {renderField('Section Title', formData.founders.title, (e) => handleInputChange('founders', 'title', e.target.value))}
                {renderField('Section Subtitle', formData.founders.subtitle, (e) => handleInputChange('founders', 'subtitle', e.target.value))}
                {formData.founders.list.map((item, index) => (
                    <div key={index} className="p-4 border rounded-md mb-2 bg-gray-50">
                        <h4 className="font-semibold mb-2">Founder {index + 1}</h4>
                        {renderField('Name', item.name, (e) => handleInputChange('founders', 'list', e.target.value, index, 'name'))}
                        {renderField('Title', item.title, (e) => handleInputChange('founders', 'list', e.target.value, index, 'title'))}
                        {renderField('Bio', item.bio, (e) => handleInputChange('founders', 'list', e.target.value, index, 'bio'), true)}
                    </div>
                ))}
            </CollapsibleSection>

        </div>
    );
};

export default CmsManager;