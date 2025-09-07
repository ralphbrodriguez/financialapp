'use server';

import { ID, Query } from "node-appwrite";
import { createAdminClient, createSessionClient } from "../appwrite";
import { cookies } from "next/headers";
import { encryptId, extractCustomerIdFromUrl, parseStringify } from "../utils";
import { CountryCode, ProcessorTokenCreateRequest, ProcessorTokenCreateRequestProcessorEnum, Products } from "plaid";

import { plaidClient } from '../plaid';
import { revalidatePath } from "next/cache";
import { addFundingSource, createDwollaCustomer } from "./dwolla.actions";

const {
  APPWRITE_DATABASE_ID: DATABASE_ID,
  APPWRITE_USER_COLLECTION_ID: USER_COLLECTION_ID,
  APPWRITE_BANK_COLLECTION_ID: BANK_COLLECTION_ID,
} = process.env;
export const signIn = async ({email, password} : signInProps) => {
    try {
        const { account } = await createAdminClient();
        const session = await account.createEmailPasswordSession(email, password);

        const cookieStore = await cookies();  
        cookieStore.set("appwrite-session", session.secret, {
          path: "/",
          httpOnly: true,
          sameSite: "strict",
          secure: true,
        });
        
        const user = await getUserInfo({ userId: session.userId });

        return parseStringify(user);
    } catch (error) {
        console.error('signIn Error:', error);
    } 
}
export const signUp = async ({ password, ...userData }: SignUpParams) => {
  const { email, firstName, lastName } = userData;
  
  let newUserAccount;

  try {
    const { account, database } = await createAdminClient();

    newUserAccount = await account.create(
      ID.unique(), 
      email, 
      password, 
      `${firstName} ${lastName}`
    );

    if(!newUserAccount) throw new Error('Error creating user')

    const dwollaCustomerUrl = await createDwollaCustomer({
      ...userData,
      type: 'personal'
    })

    if(!dwollaCustomerUrl) throw new Error('Error creating Dwolla customer')

    const dwollaCustomerId = extractCustomerIdFromUrl(dwollaCustomerUrl);

    const newUser = await database.createDocument(
      DATABASE_ID!,
      USER_COLLECTION_ID!,
      ID.unique(),
      {
        ...userData,
        userId: newUserAccount.$id,
        dwollaCustomerId,
        dwollaCustomerUrl
      }
    )

    const session = await account.createEmailPasswordSession(email, password);

    const cookieStore = await cookies();  
    cookieStore.set("appwrite-session", session.secret, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: true,
    });

    return parseStringify(newUser);
  } catch (error) {
    console.error('Error', error);
  }
}
export const getUserInfo = async ({ userId }: getUserInfoProps) => {
  try {

    const { database } = await createAdminClient();

    const user = await database.listDocuments(
      DATABASE_ID!,
      USER_COLLECTION_ID!,
      [Query.equal('userId', [userId])]
    )
    console.log('userId', userId);
    console.log('Fetched user documents:', user.documents[0]);

    return parseStringify(user.documents[0]);

  } catch (error) {
    console.log('Error getUserInfo:', error);
    return null;
  }
}
export async function getLoggedInUser() {
  try {
    // First check if session exists to avoid throwing unnecessary errors
    const { hasValidSession } = await import('@/lib/appwrite');
    if (!(await hasValidSession())) {
      console.log('No valid session found');
      return null;
    }

    const { account } = await createSessionClient();
  
    const result = await account.get();
    console.log('getLoggedInUser: User authenticated successfully');
    
    if (!result?.$id) {
      console.log('No user ID found in account result');
      return null;
    }
    
    const user = await getUserInfo({ userId: result.$id});
    
    if (!user) {
      console.log('No user found in database for userId:', result.$id);
      return null;
    }

    return parseStringify(user);
  } catch (error: any) {
    // Handle specific authentication errors more quietly
    if (error?.code === 401 || error?.type === 'general_unauthorized_scope') {
      console.log('Session expired or invalid - redirecting to sign-in');
      return null;
    }
    
    // Handle no session error
    if (error?.message === 'NO_SESSION') {
      console.log('No session cookie found - user needs to sign in');
      return null;
    }
    
    // Log other unexpected errors
    console.error('Unexpected error in getLoggedInUser:', error);
    return null;
  }
}

// Server Action to clear invalid session cookie
export const clearSessionCookie = async () => {
  'use server';
  
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    cookieStore.delete('appwrite-session');
    console.log('Session cookie cleared successfully');
    return { success: true };
  } catch (error) {
    console.log('Error clearing session cookie:', error);
    return { success: false, error };
  }
}

// Helper function to clear invalid session
export const clearInvalidSession = async () => {
  return await clearSessionCookie();
}

export const logoutAccount = async () => {
  try {
    const { account } = await createSessionClient();
    
    const cookieStore = await cookies();
    cookieStore.delete('appwrite-session');

    await account.deleteSession('current');

  } catch (error) {
    return null;
  }
}
export const createLinkToken = async (user: User) => {
  try {
    const tokenParams = {
      user: {
        client_user_id: user.$id
      },
      client_name: `${user.firstName} ${user.lastName}`,
      products: ['auth', 'transactions'] as Products[],
      language: 'en',
      country_codes: ['US'] as CountryCode[],
    }

    const response = await plaidClient.linkTokenCreate(tokenParams);

    return parseStringify({ linkToken: response.data.link_token })
  } catch (error) {
    console.log(error);
  }
}
export const createBankAccount = async ({
  userId,
  bankId,
  accountId,
  accessToken,
  fundingSourceUrl,
  shareableId,
}: createBankAccountProps) => {
  try {
    const { database } = await createAdminClient();

    const bankAccount = await database.createDocument(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      ID.unique(),
      {
        userId,
        bankId,
        accountId,
        accessToken,
        fundingSourceUrl,
        shareableId,
      }
    )

    return parseStringify(bankAccount);
  } catch (error) {
    console.log(error);
  }
}
export const exchangePublicToken = async ({
  publicToken,
  user,
}: exchangePublicTokenProps) => {
  try {
    // Exchange public token for access token and item ID
    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = response.data.access_token;
    const itemId = response.data.item_id;
    
    // Get account information from Plaid using the access token
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    const accountData = accountsResponse.data.accounts[0];

    // Create a processor token for Dwolla using the access token and account ID
    const request: ProcessorTokenCreateRequest = {
      access_token: accessToken,
      account_id: accountData.account_id,
      processor: "dwolla" as ProcessorTokenCreateRequestProcessorEnum,
    };

    const processorTokenResponse = await plaidClient.processorTokenCreate(request);
    const processorToken = processorTokenResponse.data.processor_token;

     // Create a funding source URL for the account using the Dwolla customer ID, processor token, and bank name
     const fundingSourceUrl = await addFundingSource({
      dwollaCustomerId: user.dwollaCustomerId,
      processorToken,
      bankName: accountData.name,
    });
    
    // If the funding source URL is not created, throw an error
    if (!fundingSourceUrl) throw Error;

    // Create a bank account using the user ID, item ID, account ID, access token, funding source URL, and shareableId ID
    await createBankAccount({
      userId: user.$id,
      bankId: itemId,
      accountId: accountData.account_id,
      accessToken,
      fundingSourceUrl,
      shareableId: encryptId(accountData.account_id),
    });

    // Revalidate the path to reflect the changes
    revalidatePath("/");

    // Return a success message
    return parseStringify({
      publicTokenExchange: "complete",
    });
  } catch (error) {
    console.error("An error occurred while creating exchanging token:", error);
  }
}
export const getBanks = async ({ userId }: getBanksProps) => {
  try {
    const { database } = await createAdminClient();

    const banks = await database.listDocuments(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      [Query.equal('userId', [userId])]
    )
    return parseStringify(banks.documents);

  } catch (error) {
    console.log(error)
  }
}
export const getBank = async ({ documentId }: getBankProps) => {
  try {
    // Check if documentId is valid
    if (!documentId || documentId === 'undefined') {
      console.log('Invalid documentId provided to getBank:', documentId);
      return null;
    }

    const { database } = await createAdminClient();

    const bank = await database.listDocuments(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      [Query.equal('$id', [documentId])]
    )

    if (bank.documents.length === 0) {
      console.log(`No bank found with documentId: ${documentId}`);
      return null;
    }

    return parseStringify(bank.documents[0]);

  } catch (error) {
    console.log(error);
    return null;
  }
}
