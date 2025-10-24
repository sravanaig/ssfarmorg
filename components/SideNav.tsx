
import React from 'react';
import { UsersIcon, TruckIcon, BillIcon, CreditCardIcon, MilkIcon, XIcon } from './Icons';

type View = 'customers' | 'deliveries' | 'bills' | 'payments';

interface SideNavProps {
  activeView: View;
  setView: (view: View) => void;
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
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

const SideNav: React.FC<SideNavProps> = ({ activeView, setView, isOpen, setOpen }) => {
    const handleSetView = (view: View) => {
        setView(view);
        setOpen(false);
    }
  return (
    <aside className={`absolute inset-y-0 left-0 z-30 w-64 px-4 py-8 bg-white border-r transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
                <MilkIcon className="h-8 w-8 text-blue-600"/>
                <span className="text-xl font-bold text-gray-800">ssfatmorganic</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-500 lg:hidden">
                <XIcon className="h-6 w-6"/>
            </button>
        </div>
      
      <nav className="mt-10 space-y-2">
        <NavItem
          view="customers"
          label="Customers"
          icon={<UsersIcon className="h-5 w-5" />}
          activeView={activeView}
          onClick={() => handleSetView('customers')}
        />
        <NavItem
          view="deliveries"
          label="Deliveries"
          icon={<TruckIcon className="h-5 w-5" />}
          activeView={activeView}
          onClick={() => handleSetView('deliveries')}
        />
        <NavItem
          view="bills"
          label="Bills"
          icon={<BillIcon className="h-5 w-5" />}
          activeView={activeView}
          onClick={() => handleSetView('bills')}
        />
        <NavItem
          view="payments"
          label="Payments"
          icon={<CreditCardIcon className="h-5 w-5" />}
          activeView={activeView}
          onClick={() => handleSetView('payments')}
        />
      </nav>
    </aside>
  );
};

export default SideNav;