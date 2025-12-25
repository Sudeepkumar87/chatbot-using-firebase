import Image from "next/image";
import AuthTabs from '../components/AuthTabs';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Welcome to Our Application
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Please login or register to continue
        </p>
      </div>

      <AuthTabs />
    </div>
  );
}