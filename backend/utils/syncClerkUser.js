import prisma from "../lib/prisma.js";

export const syncClerkUser = async (clerkUser) => {
  if (!clerkUser?.id) {
    throw new Error("Clerk user ID is missing");
  }

  const email =
    clerkUser.emailAddresses?.find(
      (email) => email.id === clerkUser.primaryEmailAddressId
    )?.emailAddress?.toLowerCase();

  if (!email) {
    throw new Error("Clerk user email is missing");
  }

  const name =
    clerkUser.fullName ||
    clerkUser.firstName ||
    clerkUser.username ||
    email.split("@")[0];

  const existingUser = await prisma.user.findUnique({
    where: {
      id: clerkUser.id
    }
  });

  if (existingUser) {
    return prisma.user.update({
      where: {
        id: clerkUser.id
      },
      data: {
        name,
        email
      }
    });
  }

  return prisma.user.create({
    data: {
      id: clerkUser.id,
      name,
      email,
      role: "user",
      approvalStatus: "approved"
    }
  });
};