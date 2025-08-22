'use server';
import { createAdminClient, createSessionClient } from '@/lib/appwrite';
import { cookies } from 'next/headers';
import { ID, Query } from "node-appwrite";
import { parseStringify } from '../utils';
import { log } from 'console';

const {
  APPWRITE_DATABASE_ID: DATABASE_ID,
  APPWRITE_USER_COLLECTION_ID: USER_COLLECTION_ID,
  APPWRITE_BANK_COLLECTION_ID: BANK_COLLECTION_ID,
} = process.env;

export const signIn = async ({email, password} : signInProps) => {
    try {
        const { account } = await createAdminClient();
        
        const response = await account.createEmailPasswordSession(email, password);

        return parseStringify(response);

    } catch (error) {
        console.error('signIn Error:', error);
    } 
}

export const signUp = async ({ password, ...userData }: SignUpParams) => {
    const { email, firstName, lastName } = userData;
    
    console.log('Entering the signUp in user.actions.ts');
    
    let newUserAccount;
    
    try {
        const { account } = await createAdminClient();

        let id_value;
        id_value = ID.unique();
        console.log('ID.unique',id_value);

        newUserAccount = await account.create(
            ID.unique(), 
            email, 
            password, 
            `${firstName} ${lastName}`);        

        const session = await account.createEmailPasswordSession(email, password);

        const cookieStore = await cookies();
        cookieStore.set("appwrite-session", session.secret, {
            path: "/",
            httpOnly: true,
            sameSite: "strict",
            secure: process.env.NODE_ENV === 'production',
        });
        return parseStringify(newUserAccount);

    } catch (error) {
        console.error('signUp Error:', error);
    } 
}
export const getUserInfo = async ({ userId }: getUserInfoProps) => {
  try {

    console.log('Fetching user info for userId:', userId);
    const { database } = await createAdminClient();
    console.log('Database client initialized:', database);

    const user = await database.listDocuments(
      DATABASE_ID!,
      USER_COLLECTION_ID!,
      [Query.equal('userId', [userId])]
    )
    console.log('user values', user);

    return parseStringify(user.documents[0]);

  } catch (error) {
    console.log('getUserInfo Error:', error);
  }
}
export async function getLoggedInUser() {
  try {
    const { account } = await createSessionClient();
    
    // const result = await account.get();
    //const user = await getUserInfo({ userId: result.$id})

    const user = await account.get();

    return parseStringify(user);

  } catch (error) {
    console.log('getLoggedInUser Error:', error);
    return null;
  }
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
