import User from "../models/User.js";

const normalizeUsernamePart = (value = "") =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const generateUsername = async (firstName, lastName) => {
  const first = normalizeUsernamePart(firstName);
  const last = normalizeUsernamePart(lastName);

  if (!first || !last) {
    throw new Error(
      "A valid first name and last name are required to generate a username."
    );
  }

  const baseUsername = `${first}.${last}`;

  // Use the base username when it is available.
  const baseExists = await User.exists({
    username: baseUsername,
  });

  if (!baseExists) {
    return baseUsername;
  }

  // Otherwise, find the next available numbered username.
  let suffix = 2;

  while (true) {
    const candidate = `${baseUsername}${suffix}`;

    const existingUser = await User.exists({
      username: candidate,
    });

    if (!existingUser) {
      return candidate;
    }

    suffix += 1;
  }
};

export default generateUsername;
