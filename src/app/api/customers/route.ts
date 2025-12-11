import { getCustomers } from '@/server/functions/customers';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { customerTable } from '@/server/db/schema';

export const runtime = 'edge';

export async function GET() {
  try {
    const customers = await getCustomers();
    return NextResponse.json({ customers });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const customerId = formData.get('customerId') as string;
    
    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
    }

    // サーバーアクションを直接呼び出す代わりに、直接DB操作を行う
    await db.insert(customerTable).values({
      customerId: Number(customerId),
      companyName: 'Alfreds Futterkiste',
      contactName: 'Maria Anders',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error inserting customer:', error);
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }
}

