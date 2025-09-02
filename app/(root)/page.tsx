import HeaderBox from '@/components/HeaderBox'
import RecentTransactions from '@/components/RecentTransactions';
import RightSidebar from '@/components/RightSidebar';
import TotalBalanceBox from '@/components/TotalBalanceBox';
import { getAccount, getAccounts } from '@/lib/actions/bank.actions';
import { getLoggedInUser } from '@/lib/actions/user.actions';
import { redirect } from 'next/navigation';

const Home = async ({ searchParams }: SearchParamProps) => {
  const { id, page } = await searchParams;
  const currentPage = Number(page as string) || 1;
  const loggedIn = await getLoggedInUser();
  
  // Redirect if not logged in
  if (!loggedIn) {
    redirect('/sign-in');
  }

  const accounts = await getAccounts({ userId: loggedIn.$id });  
  if(!accounts) return;

  const accountsData = accounts?.data;
  const appwriteItemId = (id as string) || accountsData[0]?.appwriteItemId;  
  
  // Only get account if we have a valid appwriteItemId
  const account = appwriteItemId ? await getAccount({ appwriteItemId }) : null;
  
  console.log('accounts',{accountsData, account, appwriteItemId});
  
  // Handle case where user has no bank accounts
  if (!accountsData || accountsData.length === 0) {
    return (
      <section className="home">
        <div className="home-content">
          <header className="home-header">
            <HeaderBox 
              type="greeting"
              title="Welcome"
              user={loggedIn?.firstName || 'Guest'}
              subtext="Connect your first bank account to get started."
            />
            
            <div className="flex flex-col items-center justify-center py-12">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                No Bank Accounts Connected
              </h2>
              <p className="text-gray-600 mb-6 text-center max-w-md">
                To get started with managing your finances, you'll need to connect at least one bank account.
              </p>
              <button className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">
                Connect Your First Bank
              </button>
            </div>
          </header>
        </div>
      </section>
    );
  }

  return (
    <section className="home">
      <div className="home-content">
        <header className="home-header">
          <HeaderBox 
            type="greeting"
            title="Welcome"
            user={loggedIn?.firstName || 'Guest'}
            subtext="Access and manage your account and transactions efficiently."
          />

          <TotalBalanceBox 
            accounts={accountsData}
            totalBanks={accounts?.totalBanks}
            totalCurrentBalance={accounts?.totalCurrentBalance}
          />
        </header>        

        <RecentTransactions 
          accounts={accountsData}
          transactions={account?.transactions}
          appwriteItemId={appwriteItemId}
          page={currentPage}
        />
      </div>

      <RightSidebar 
        user={loggedIn}
        transactions={account?.transactions}
        banks={accountsData?.slice(0, 2)}
      />
    </section>
  )
}
export default Home