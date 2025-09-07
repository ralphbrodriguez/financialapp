"use server";

import {
  ACHClass,
  CountryCode,
  TransferAuthorizationCreateRequest,
  TransferCreateRequest,
  TransferNetwork,
  TransferType,
} from "plaid";

import { plaidClient } from "../plaid";
import { parseStringify } from "../utils";
//import { getTransactionsByBankId } from "./transaction.actions";
import { getBanks, getBank } from "./user.actions";

// Get multiple bank accounts
export const getAccounts = async ({ userId }: getAccountsProps) => {
  try {
    // get banks from db
    const banks = await getBanks({ userId });

    console.log("Retrieved banks from database:", banks);

    if (!banks || banks.length === 0) {
      return {
        data: [],
        totalBanks: 0,
        totalCurrentBalance: 0,
      };
    }

    const accounts = await Promise.all(
      banks?.map(async (bank: Bank) => {
        // Check if bank has accessToken before using it
        if (!bank?.accessToken) {
          console.log('Bank missing accessToken:', bank);
          return null;
        }

        // get each account info from plaid
        const accountsResponse = await plaidClient.accountsGet({
          access_token: bank.accessToken,
        });
        const accountData = accountsResponse.data.accounts[0];

        // get institution info from plaid
        const institution = await getInstitution({
          institutionId: accountsResponse.data.item.institution_id!,
        });

        const account = {
          id: accountData.account_id,
          availableBalance: accountData.balances.available!,
          currentBalance: accountData.balances.current!,
          institutionId: institution.institution_id,
          name: accountData.name,
          officialName: accountData.official_name,
          mask: accountData.mask!,
          type: accountData.type as string,
          subtype: accountData.subtype! as string,
          appwriteItemId: bank.$id,
          shareableId: bank.shareableId,
        };

        console.log('appwriteItemId from bank.#id:', bank.$id);

        return account;
      })
    );

    // Filter out null accounts (banks without accessToken)
    const validAccounts = accounts.filter(account => account !== null);

    const totalBanks = validAccounts.length;
    const totalCurrentBalance = validAccounts.reduce((total, account) => {
      return total + account.currentBalance;
    }, 0);

    return parseStringify({ data: validAccounts, totalBanks, totalCurrentBalance });
    
  } catch (error) {
    console.error("An error occurred while getting the accounts:", error);
  }
};

// Get one bank account
export const getAccount = async ({ appwriteItemId }: getAccountProps) => {
  try {
    // get bank from db
    const bank = await getBank({ documentId: appwriteItemId });

    console.log('bank:', bank);

    // Check if bank exists and has accessToken
    if (!bank || !bank.accessToken) {
      console.log('Bank not found or missing accessToken:', { appwriteItemId, bank });
      return null;
    }

    // get account info from plaid
    const accountsResponse = await plaidClient.accountsGet({
      access_token: bank.accessToken,
    });
    const accountData = accountsResponse.data.accounts[0];

    // get transfer transactions from appwrite
/*     const transferTransactionsData = await getTransactionsByBankId({
      bankId: bank.$id,
    }); */

/*     const transferTransactions = transferTransactionsData.documents.map(
      (transferData: Transaction) => ({
        id: transferData.$id,
        name: transferData.name!,
        amount: transferData.amount!,
        date: transferData.$createdAt,
        paymentChannel: transferData.channel,
        category: transferData.category,
        type: transferData.senderBankId === bank.$id ? "debit" : "credit",
      })
    ); */

    // get institution info from plaid
    const institution = await getInstitution({
      institutionId: accountsResponse.data.item.institution_id!,
    });

    const transactions = await getTransactions({
      accessToken: bank?.accessToken,
    });

    const account = {
      id: accountData.account_id,
      availableBalance: accountData.balances.available!,
      currentBalance: accountData.balances.current!,
      institutionId: institution.institution_id,
      name: accountData.name,
      officialName: accountData.official_name,
      mask: accountData.mask!,
      type: accountData.type as string,
      subtype: accountData.subtype! as string,
      appwriteItemId: bank.$id,
    };

    // sort transactions by date such that the most recent transaction is first
    const allTransactions = Array.isArray(transactions) ? [...transactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    ) : [];

    return parseStringify({
      data: account,
      transactions: allTransactions,
    });
  } catch (error) {
    console.error("An error occurred while getting the account:", error);
    throw error; // Re-throw the error so it can be handled by the caller
  }
};

// Get bank info
export const getInstitution = async ({
  institutionId,
}: getInstitutionProps) => {
  try {
    const institutionResponse = await plaidClient.institutionsGetById({
      institution_id: institutionId,
      country_codes: ["US"] as CountryCode[],
    });

    const intitution = institutionResponse.data.institution;

    return parseStringify(intitution);
  } catch (error) {
    console.error("An error occurred while getting the accounts:", error);
  }
};

// Get transactions
export const getTransactions = async ({
  accessToken,
}: getTransactionsProps) => {
  try {
    // Use the simpler transactionsGet endpoint for sandbox
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // Get last 30 days
    
    const endDate = new Date();
    
    console.log('Fetching transactions with access token:', accessToken ? 'present' : 'missing');
    
    if (!accessToken) {
      console.log('No access token provided, returning empty transactions');
      return [];
    }
    
    // Format dates properly for Plaid API
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    console.log('Transaction date range:', { startDate: startDateStr, endDate: endDateStr });
    
    const response = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: startDateStr,
      end_date: endDateStr,
    });

    console.log(`Successfully fetched ${response.data.transactions.length} transactions`);
    
    const transactions = response.data.transactions.map((transaction) => ({
      id: transaction.transaction_id,
      name: transaction.name,
      paymentChannel: transaction.payment_channel,
      type: transaction.payment_channel,
      accountId: transaction.account_id,
      amount: transaction.amount,
      pending: transaction.pending,
      category: transaction.category ? transaction.category[0] : "",
      date: transaction.date,
      image: transaction.logo_url,
    }));

    return parseStringify(transactions);
  } catch (error: any) {
    console.error("An error occurred while getting the transactions:", error);
    
    // Log additional error details for debugging
    if (error.response) {
      console.error("Error response details:", {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    } else if (error.message) {
      console.error("Error message:", error.message);
    } else {
      console.error("Unknown error structure:", typeof error, error);
    }
    
    // For sandbox/development, return mock transactions if API fails
    if (process.env.NODE_ENV === 'development' && error.response?.status === 400) {
      console.log('Returning mock transactions for development');
      return parseStringify([
        {
          id: 'mock-transaction-1',
          name: 'Mock Transaction',
          paymentChannel: 'online',
          type: 'online',
          accountId: 'mock-account',
          amount: -25.50,
          pending: false,
          category: 'Food and Drink',
          date: new Date().toISOString().split('T')[0],
          image: null,
        }
      ]);
    }
    
    // Throw a proper error with details instead of returning empty array
    throw new Error(`Failed to fetch transactions: ${error.message || 'Unknown error'}`);
  }
};