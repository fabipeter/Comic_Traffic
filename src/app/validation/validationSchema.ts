import { object, string, ref, boolean, number, array } from "yup";
const phoneRegExp =
  /^(\+?\d{0,4})?\s?-?\s?(\(?\d{3}\)?)\s?-?\s?(\(?\d{3}\)?)\s?-?\s?(\(?\d{4}\)?)?$/;
const digitsOnly = (value: any) => /^\d+$/.test(value);

export const authSchema = {
  login: object().shape({
    email: string()
      .email("Enter a Valid Email Address")
      .required("Email is Required"),
    // password: string()
    //   .min(4, "Password too short")
    //   .max(40, "oops, too long")
    //   .required("Password is required"),
  }),
  forgotPassword: object().shape({
    email: string()
      .email("Enter a Valid Email Address")
      .required("Email is Required"),
  }),
  resetPassword: object().shape({
    newPassword: string()
      .min(6, "Password too short")
      .max(40, "oops, too long")
      .required("Password is required"),
    confirmPassword: string()
      .oneOf([ref("newPassword")], "Passwords don't match")
      .required("Confirm Password is required"),
  }),
  register: object().shape({
    firstName: string()
      .min(2, "too short")
      .max(30, "")
      .required("First Name is Required"),
    lastName: string()
      .min(2, "too short")
      .max(30, "")
      .required("Last Name is Required"),
    email: string()
      .min(2, "email is too short")
      .email("Enter email")
      .required("Email is Required"),
    // address: string()
    //   .min(5, "Address is too short")
    //   .max(50, "")
    //   .required("Address is Required"),
    // state: string().required("State is required"),
    // city: string().required("City is required"),
    phoneNumber: string()
      .matches(phoneRegExp, "Phone number is not valid")
      .min(9, "Phone number is too short")
      .max(14, "enter a valid phone number")
      .required("Phone Number is required"),
    saFcurrentAccount: string()
      .min(9, "Account Invalid")
      .max(14, "Invalid Account Number")
      .required("SAF Account required"),
    // password: string()
    //   .min(6, "Password is too short")
    //   .max(30, "")
    //   .required("Enter a password"),
    // confirmPassword: string()
    //   .oneOf([ref("password"), null], "Passwords don't match")
    //   .required("Confirm Password is required"),
    categoryOfProduct: array()
      .min(1, "At least one option is required")
      .required("Product Category is required"),
  }),
  kyc: object().shape({
    // uploadImage: string().required("Image not Uploaded"),
    representativeName1: string().required("Representative 1 Name is required"),
    representativeName2: string().required("Representative 2 Name is required"),
    dateofRegistration: string().required("Date of Registration is required"),
    cacRegistrationNumber: string().required(
      "CAC Registration Number is required"
    ),
    operationLocation: array()
      .min(1, "At least one option is required")
      .required(),
    // .of(
    //   object().shape({
    //     key: string().required("select a local government"),
    //     value: string().required("select a local government"),
    //     label: string().required("select a local government"),
    //   })
    // )
    // .nullable()
    // .required("This field is required."),
    accountNumber: string().required("Account Number is required"),
    accountName: string().required("Account Name is required"),
    // bvn: string().required("BVN is required"),
    // acctPhoneNumber: string().required("Phone Number is required"),
  }),
};

export const vendorSchema = {
  product: object().shape({
    productName: string().required("Product Name is required"),
    longDescription: string().required("Product Description is required"),
    buyerNote: string().required("Buyer's note is required"),
    categoryId: string().required("Category is required"),
    // categoryId: object()
    //   .shape({
    //     key: string().required("select a category"),
    //     value: string().required("select a category"),
    //     label: string().required("select a category"),
    //   })
    //   .nullable()
    //   .required("This field is required."),
    // supplyTime: string()
    //   .required("Product Supply Time is required")
    //   .test('Digits only', 'Must be a Number', digitsOnly),
    // brandId: object()
    //   .shape({
    //     key: string().required("select a time"),
    //     value: string().required("select a time"),
    //     label: string().required("select a time"),
    //   })
    //   .nullable()
    //   .required("This field is required."),
    productQuantity: number()
      .required("Quantity is required")
      .test(
        "Is positive?",
        "The number must be greater than 0!",
        (value) => value! > 0
      ),
    productPrice: number()
      .required("Price is required")
      .test(
        "Is positive?",
        "The number must be greater than 0!",
        (value) => value! > 0
      ),
    // productLocations: array()
    //   .min(1, "At least one option is required")
    //   .required(),
    // productStatus: object()
    //   .shape({
    //     key: string().required("select a status"),
    //     value: string().required("select a status"),
    //     label: string().required("select a status"),
    //   })
    //   .nullable()
    //   .required("This field is required."),
    weight: number()
      .typeError("Weight must be a number")
      .required("Weight is required")
      .test(
        "Is positive?",
        "The number must be greater than 0!",
        (value) => value! > 0
      ),
    // location: string().required("Location is required"),
  }),
  personalSettings: object().shape({
    password: string()
      .min(4, "Password too short")
      .required("Password is Required"),
  }),
  storeSettings: object().shape({
    // storeName: string()
    //   .min(4, "Address too short")
    //   .required("Store Address is Required"),
    storeAddress: string()
      .min(4, "Address too short")
      .required("Store Address is Required"),
    storeInformation: string()
      .min(4, "Info too short")
      .required("Store Info is Required"),
    state: string().required("State is required"),
    city: string().required("City is required"),
  }),
};
