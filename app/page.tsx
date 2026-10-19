import { redirect } from 'next/navigation';

async function go() {
  'use server';
  // `/target` is rewritten by middleware.ts.
  redirect('/target');
}

export default function Page() {
  return (
    <form action={go}>
      <button type="submit">Run the Server Action</button>
    </form>
  );
}
