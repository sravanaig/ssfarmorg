
import React from 'react';
import { UsersIcon, TruckIcon, BillIcon, CreditCardIcon, XIcon, DashboardIcon, PencilIcon, DatabaseIcon, ClipboardIcon, CheckIcon as ApprovalIcon, CalendarIcon, KeyIcon } from './Icons';
import type { Profile } from '../types';

type View = 'dashboard' | 'customers' | 'orders' | 'deliveries' | 'bills' | 'payments' | 'cms' | 'database' | 'delivery_approvals' | 'logins' | 'calendar' | 'customer_logins';

interface SideNavProps {
  activeView: View;
  setView: (view: View) => void;
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  userRole: Profile['role'] | 'customer' | null;
}

const NavItem: React.FC<{
  view: View;
  label: string;
  icon: React.ReactNode;
  activeView: View;
  onClick: () => void;
}> = ({ view, label, icon, activeView, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center w-full px-4 py-3 text-sm font-medium transition-colors duration-200 ${
      activeView === view
        ? 'bg-blue-600 text-white rounded-lg'
        : 'text-gray-600 hover:bg-gray-200 hover:text-gray-800 rounded-lg'
    }`}
  >
    {icon}
    <span className="ml-3">{label}</span>
  </button>
);

// Menu definitions
const staffItems = [
    { view: 'customers', label: 'Customers', icon: <UsersIcon className="h-5 w-5" /> },
    { view: 'orders', label: 'Orders', icon: <ClipboardIcon className="h-5 w-5" /> },
    { view: 'deliveries', label: 'Deliveries', icon: <TruckIcon className="h-5 w-5" /> }, // Staff view of deliveries
    { view: 'bills', label: 'Bills', icon: <BillIcon className="h-5 w-5" /> },
];

const adminItems = [
    { view: 'dashboard', label: 'Dashboard', icon: <DashboardIcon className="h-5 w-5" /> },
    { view: 'customers', label: 'Customers', icon: <UsersIcon className="h-5 w-5" /> },
    { view: 'customer_logins', label: 'Customer Logins', icon: <KeyIcon className="h-5 w-5" /> },
    { view: 'logins', label: 'Staff Logins', icon: <UsersIcon className="h-5 w-5" /> },
    { view: 'orders', label: 'Orders', icon: <ClipboardIcon className="h-5 w-5" /> },
    { view: 'deliveries', label: 'Deliveries', icon: <TruckIcon className="h-5 w-5" /> }, // Admin view
    { view: 'delivery_approvals', label: 'Approvals', icon: <ApprovalIcon className="h-5 w-5" /> },
    { view: 'calendar', label: 'Calendar', icon: <CalendarIcon className="h-5 w-5" /> },
    { view: 'bills', label: 'Bills', icon: <BillIcon className="h-5 w-5" /> },
    { view: 'payments', label: 'Payments', icon: <CreditCardIcon className="h-5 w-5" /> },
];

const superAdminSystemItems = [
    { view: 'cms' as View, label: 'Website Content', icon: <PencilIcon className="h-5 w-5" /> },
    { view: 'database' as View, label: 'Database Helper', icon: <DatabaseIcon className="h-5 w-5" /> },
];

const SideNav: React.FC<SideNavProps> = ({ activeView, setView, isOpen, setOpen, userRole }) => {
    const handleSetView = (view: View) => {
        setView(view);
        setOpen(false);
    }
    
    let navItemsToShow: any[] = [];
    let systemItemsToShow: any[] = [];

    if (userRole === 'super_admin') {
        navItemsToShow = adminItems;
        systemItemsToShow = superAdminSystemItems;
    } else if (userRole === 'admin') {
        navItemsToShow = adminItems;
    } else if (userRole === 'staff') {
        navItemsToShow = staffItems;
    }
    
  return (
    <aside className={`absolute inset-y-0 left-0 z-30 w-64 px-4 py-8 bg-white border-r transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
                <img src="https://raw.githubusercontent.com/sravanaig/images/refs/heads/main/images/logo.png" alt="ssfarmorganic logo" className="h-8 w-8" />
                <span className="text-xl font-bold text-gray-800">ssfarmorganic</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-500 lg:hidden">
                <XIcon className="h-6 w-6"/>
            </button>
        </div>
        
        <div className="mt-6 mb-2 px-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                {userRole?.replace('_', ' ')}
            </span>
        </div>
      
      <nav className="mt-4 space-y-2">
        {navItemsToShow.map(item => (
            <NavItem
                key={item.view}
                view={item.view as View}
                label={item.label}
                icon={item.icon}
                activeView={activeView}
                onClick={() => handleSetView(item.view as View)}
            />
        ))}

        {systemItemsToShow.length > 0 && (
            <div className="pt-4 mt-4 border-t border-gray-200">
                <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">System</p>
                {systemItemsToShow.map(item => (
                    <NavItem
                        key={item.view}
                        view={item.view}
                        label={item.label}
                        icon={item.icon}
                        activeView={activeView}
                        onClick={() => handleSetView(item.view)}
                    />
                ))}
            </div>
        )}
      </nav>
    </aside>
  );
};

export default SideNav;
