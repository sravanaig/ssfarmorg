
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { Customer } from '../types';
import { SearchIcon, MapPinIcon, MapIcon, SpinnerIcon, ListIcon, GridIcon } from './Icons';

// Declare Leaflet global
declare const L: any;

interface LocationManagerProps {
  customers: Customer[];
}

const LocationManager: React.FC<LocationManagerProps> = ({ customers }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  // Change default filterMode to 'all' so customers are visible immediately
  const [filterMode, setFilterMode] = useState<'all' | 'mapped' | 'unmapped'>('all');
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  // Defensive check: Ensure customers is always an array and filter out any malformed entries
  const safeCustomers = useMemo(() => {
      if (!customers || !Array.isArray(customers)) return [];
      return customers.filter(c => c && typeof c === 'object');
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    let result = safeCustomers.filter(c => c.status === 'active'); // Only show active customers by default

    // Apply text filter
    if (searchTerm.trim()) {
      const lowerFilter = searchTerm.toLowerCase();
      result = result.filter(c => 
        (c.name && c.name.toLowerCase().includes(lowerFilter)) ||
        (c.address && c.address.toLowerCase().includes(lowerFilter)) ||
        (c.phone && c.phone.includes(lowerFilter))
      );
    }

    // Apply location filter (only relevant for list view filtering logic, map view always shows mapped)
    if (viewMode === 'list') {
        if (filterMode === 'mapped') {
            result = result.filter(c => c.locationLat && c.locationLng);
        } else if (filterMode === 'unmapped') {
            result = result.filter(c => !c.locationLat || !c.locationLng);
        }
    } else {
        // For map view, we naturally only show those with coordinates
        result = result.filter(c => c.locationLat && c.locationLng);
    }

    // Sort: Mapped first, then alphabetical
    return result.sort((a, b) => {
        const aMapped = a.locationLat && a.locationLng ? 1 : 0;
        const bMapped = b.locationLat && b.locationLng ? 1 : 0;
        if (aMapped !== bMapped) return bMapped - aMapped;
        return (a.name || '').localeCompare(b.name || '');
    });
  }, [safeCustomers, searchTerm, filterMode, viewMode]);

  const stats = useMemo(() => {
      const active = safeCustomers.filter(c => c.status === 'active');
      const mapped = active.filter(c => c.locationLat && c.locationLng).length;
      return { total: active.length, mapped };
  }, [safeCustomers]);

  // Initialize Map
  useEffect(() => {
    if (viewMode === 'map' && mapContainerRef.current && filteredCustomers.length > 0) {
        // Safety check if Leaflet is not loaded
        if (typeof L === 'undefined') {
            console.error("Leaflet library not loaded");
            return;
        }

        if (!mapInstanceRef.current) {
            // Calculate center
            let totalLat = 0;
            let totalLng = 0;
            let count = 0;
            
            filteredCustomers.forEach(c => {
                if (c.locationLat && c.locationLng) {
                    totalLat += c.locationLat;
                    totalLng += c.locationLng;
                    count++;
                }
            });

            const centerLat = count > 0 ? totalLat / count : 17.3850; // Default to Hyderabad if empty
            const centerLng = count > 0 ? totalLng / count : 78.4867;

            mapInstanceRef.current = L.map(mapContainerRef.current).setView([centerLat, centerLng], 12);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(mapInstanceRef.current);
        } else {
             // Invalidate size to ensure tiles load correctly if container resized
             setTimeout(() => {
                 mapInstanceRef.current.invalidateSize();
             }, 100);
        }

        // Clear existing markers
        mapInstanceRef.current.eachLayer((layer: any) => {
            if (layer instanceof L.Marker) {
                mapInstanceRef.current.removeLayer(layer);
            }
        });

        // Add markers
        const markers: any[] = [];
        filteredCustomers.forEach(customer => {
            if (customer.locationLat && customer.locationLng) {
                const marker = L.marker([customer.locationLat, customer.locationLng])
                    .addTo(mapInstanceRef.current)
                    .bindPopup(`
                        <div style="font-family: sans-serif;">
                            <h3 style="font-weight: bold; margin-bottom: 4px; font-size: 14px;">${customer.name}</h3>
                            <p style="margin: 0 0 8px 0; font-size: 12px; color: #555;">${customer.phone || ''}</p>
                            <p style="margin: 0 0 8px 0; font-size: 12px; color: #555;">${customer.address}</p>
                            <a href="https://www.google.com/maps/search/?api=1&query=${customer.locationLat},${customer.locationLng}" 
                               target="_blank" 
                               style="display: inline-block; background-color: #2563eb; color: white; padding: 4px 8px; text-decoration: none; border-radius: 4px; font-size: 12px;">
                               Navigate (Google Maps)
                            </a>
                        </div>
                    `);
                markers.push(marker);
            }
        });

        // Fit bounds if markers exist
        if (markers.length > 0) {
            const group = L.featureGroup(markers);
            mapInstanceRef.current.fitBounds(group.getBounds().pad(0.1));
        }
    }

    return () => {
        if (viewMode !== 'map' && mapInstanceRef.current) {
            mapInstanceRef.current.remove();
            mapInstanceRef.current = null;
        }
    };
  }, [viewMode, filteredCustomers]);


  if (!customers) {
      return (
        <div className="flex justify-center items-center h-64">
            <SpinnerIcon className="h-8 w-8 animate-spin text-blue-500" />
            <span className="ml-2 text-gray-500">Loading locations...</span>
        </div>
      );
  }

  return (
    <div className="flex flex-col h-full">
        <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
            <div>
                <h2 className="text-3xl font-bold text-gray-800">Customer Locations</h2>
                <p className="text-sm text-gray-500 mt-1">
                    {stats.mapped} of {stats.total} active customers have GPS locations.
                </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 items-center">
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button 
                        onClick={() => setViewMode('list')}
                        className={`flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <ListIcon className="h-4 w-4 mr-2" /> List
                    </button>
                    <button 
                        onClick={() => setViewMode('map')}
                        className={`flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${viewMode === 'map' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <MapIcon className="h-4 w-4 mr-2" /> Map
                    </button>
                </div>

                {viewMode === 'list' && (
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button 
                            onClick={() => setFilterMode('all')}
                            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${filterMode === 'all' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            All
                        </button>
                        <button 
                            onClick={() => setFilterMode('mapped')}
                            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${filterMode === 'mapped' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Mapped
                        </button>
                        <button 
                            onClick={() => setFilterMode('unmapped')}
                            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${filterMode === 'unmapped' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Unmapped
                        </button>
                    </div>
                )}

                <div className="relative w-full sm:w-auto">
                    <input
                        type="text"
                        placeholder="Search customers..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full sm:w-64 border border-gray-300 rounded-lg shadow-sm py-2 px-3 pl-10 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                </div>
            </div>
        </div>

        {viewMode === 'map' ? (
            <div className="flex-grow min-h-[500px] bg-gray-200 rounded-lg shadow-inner relative z-0">
                <div id="map-container" ref={mapContainerRef} className="absolute inset-0 rounded-lg z-0" />
                {filteredCustomers.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-80 z-10 rounded-lg">
                        <p className="text-gray-500 font-medium">No customers found with location data.</p>
                    </div>
                )}
            </div>
        ) : (
            <>
            {filteredCustomers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20">
                    {filteredCustomers.map(customer => {
                        const hasLocation = customer.locationLat && customer.locationLng;
                        
                        return (
                            <div key={customer.id} className="bg-white border rounded-lg shadow-sm p-4 flex flex-col justify-between hover:shadow-md transition-shadow">
                                <div>
                                    <div className="flex justify-between items-start">
                                        <h3 className="font-bold text-gray-800 text-lg truncate" title={customer.name}>{customer.name}</h3>
                                        {hasLocation ? (
                                            <span className="text-green-500"><MapPinIcon className="h-5 w-5" /></span>
                                        ) : (
                                            <span className="text-gray-300"><MapPinIcon className="h-5 w-5" /></span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-600 mt-1 line-clamp-2" title={customer.address}>{customer.address}</p>
                                    <p className="text-sm text-gray-500 mt-1">{customer.phone || 'No phone'}</p>
                                </div>
                                
                                <div className="mt-4 pt-3 border-t">
                                    {hasLocation ? (
                                        <a 
                                            href={`https://www.google.com/maps/search/?api=1&query=${customer.locationLat},${customer.locationLng}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-center w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
                                        >
                                            <MapIcon className="h-5 w-5 mr-2" />
                                            Navigate
                                        </a>
                                    ) : (
                                        <button 
                                            disabled
                                            className="flex items-center justify-center w-full px-4 py-2 bg-gray-100 text-gray-400 rounded-md cursor-not-allowed font-medium"
                                        >
                                            <MapPinIcon className="h-5 w-5 mr-2" />
                                            No Location Set
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-16 bg-white rounded-lg border-2 border-dashed border-gray-200">
                    <div className="mx-auto h-12 w-12 text-gray-400 mb-3">
                        <MapIcon className="h-12 w-12" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900">No Customers Found</h3>
                    <p className="mt-1 text-sm text-gray-500">
                        {filterMode === 'mapped' 
                            ? "No active customers with GPS locations match your search." 
                            : "No active customers match your search."}
                    </p>
                    {filterMode === 'mapped' && (
                        <button 
                            onClick={() => setFilterMode('all')}
                            className="mt-4 px-4 py-2 text-sm text-blue-600 hover:underline"
                        >
                            View all customers
                        </button>
                    )}
                </div>
            )}
            </>
        )}
    </div>
  );
};

export default LocationManager;
