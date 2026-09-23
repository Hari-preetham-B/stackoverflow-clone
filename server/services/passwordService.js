import crypto from "crypto";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export const generateRandomPassword = (length = 12) => {
  let password = "";

  for (let i = 0; i < length; i++) {
    const index = crypto.randomInt(0, LETTERS.length);
    password += LETTERS[index];
  }

  return password;
};
