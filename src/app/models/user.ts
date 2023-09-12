export interface User {
    username: string;
    displayName: string;
    token: string;
    image?: string;
  }
  
  export interface IUserLoginData {
    access_token: string;
    refresh_token: string;
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
    address: string;
    phoneNumber: string;
    role: any;
    isEmailVerified: boolean;
    sellingPermission: boolean;
    isSuspended: boolean;
    isActive: boolean;
    isProfileCompleted: boolean;
    createdAt: any;
  }
  
  export interface UserProfile {
    access_token: string;
    refresh_token: string;
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
    address: string;
    phoneNumber: string;
    role: number;
    isEmailVerified: boolean;
    createdAt: string;
  }
  
  export interface UserFormValues {
    email: string;
    password: string;
    // displayName?: string;
    // username?: string;
  }
  
  export class VendorRegistrationForm {
    firstName: string = "";
    lastName: string = "";
    email: string = "";
    address: string = "";
    state: string = "";
    city: string = "";
    phoneNumber: string = "";
    saFcurrentAccount: string = "";
    // confirmPassword: string = "";
    categoryOfProduct: string[] = [];
  }
  
  export interface IVendorRegistrationForm {
    firstName: string;
    lastName: string;
    email: string;
    address: string;
    state: string;
    city: string;
    phoneNumber: string;
    saFcurrentAccount: string;
    confirmPassword: string;
    categoryOfProduct: string;
  }
  export class VendorUpdateForm {
    headerImageUrl: string | null = "";
    logoImageUrl: string | null = "";
    storeAddress: string | null = "";
    storeInformation: string | null = "";
    state: string | null = "";
    city: string | null = "";
    storeName: string | null = "";
    password: string | null = "";
  }
  export class LoginForm {
    email: string = "";
    password: string = "";
  }
  export class PasswordChangeForm {
    email: string = "";
    confirmPassword: string = "";
    newPassword: string = "";
  }
  export class PasswordOtpData {
    phoneNumber: string = "";
    otp: string = "";
  }
  
  export class VendorScoreForm {
    firmSize: string = "";
    establishedYears: string = "";
    annualTurnover: string = "";
    percentTotalAnnualTurnOver: string = "";
    businessStructure: string = "";
    relevanceOfCVs: string = "";
    localPresences: string = "";
    noOfInstallationsDone: string = "";
    experienceNigeriaMarket: string = "";
    experienceSolarSystem: string = "";
    levelOfWarrantySolar: string = "";
    renewableEnergy: string = "";
  }
  export interface IVendorScoreForm {
    firmSize: string;
    establishedYears: string;
    annualTurnover: string;
    percentTotalAnnualTurnOver: string;
    businessStructure: string;
    relevanceOfCVs: string;
    localPresences: string;
    noOfInstallationsDone: string;
    experienceNigeriaMarket: string;
    experienceSolarSystem: string;
    levelOfWarrantySolar: string;
    renewableEnergy: string;
  }
  export class VendorsResponse {
    data: any | null;
    responseCode: string = "";
    responseMessage: string = "";
    isSuccessful: boolean = false;
  }
  
  export class ProductCategory {
    categoryId: string = "";
    category: string = "";
  }
  export class States {
    regioN_CODE: string = "";
    state: string = "";
  }
  export class AccountInformation {
    vendorId: string = "";
    role: number = 0;
    state: string | null = "";
    city: string | null = "";
    headerImageUrl: string | null = "";
    storeAddress: string | null = "";
    // storeInfromation: string | null = "";
    storeName: string | null = "";
    storeLogoUrl: string | null = "";
    firstName: string | null = "";
    lastName: string | null = "";
    email: string | null = "";
    gender: string | null = "";
    address: string | null = "";
    phoneNumber: string | null = "";
    password: string | null = "";
    isEmailVerified: boolean = false;
    sellingPermission: boolean = false;
    status: string | null = "";
    isProfileCompleted: boolean = false;
    isActive: string | null = "";
    isSuspended: boolean = false;
    rating: string | null = "";
    slug: string | null = "";
    storeUrl: string | null = "";
    storeLGA: string | null = "";
    storeState: string | null = "";
    bankAccountName: string | null = "";
    bankAccountNumber: string | null = "";
    storeInformation: string | null = "";
  }
  export enum EstablishedYears {
    OverFiveYears = "OverFiveYears",
    OverTwoYears = "OverTwoYears",
    LessThanTwoYears = "LessThanTwoYears",
  }
  export enum FirmSize {
    OverTwentyFive = "OverTwentyFive",
    TenToTwenty = "TenToTwenty",
    LessThanTen = "LessThanTen",
  }
  export enum AnnualTurnover {
    OverFiveHundredMetre = "OverFiveHundredMetre",
    OneHundredAndOneToFiveHundredMetre = "OneHundredAndOneToFiveHundredMetre",
    LessThanHundredMetre = "LessThanHundredMetre",
  }
  export enum PercentTotalAnnualTurnOver {
    OverEightyPercent = "OverEightyPercent",
    FortyToEightyPercent = "FortyToEightyPercent",
    LessThanFortyPercent = "LessThanFortyPercent",
  }
  export enum BusinessStructure {
    Excellence = "Excellence",
    Average = "Average",
    Poor = "Poor",
  }
  export enum RelevanceOfCVs {
    Excellence = "Excellence",
    Average = "Average",
    Poor = "Poor",
  }
  export enum LocalPresences {
    High = "High",
    Average = "Average",
    Poor = "Poor",
  }
  export enum NoOfInstallationsDone {
    OverFiveHundred = "OverFiveHundred",
    HundredToFourHundredNinetyNine = "HundredToFourHundredNinetyNine",
    LessThanHundred = "LessThanHundred",
  }
  export enum ExperienceNigeriaMarket {
    OverSix = "OverSix",
    ThreeToFive = "ThreeToFive",
    LessThanTwo = "LessThanTwo",
  }
  export enum ExperienceSolarSystem {
    OverFive = "OverFive",
    ThreeToFive = "ThreeToFive",
    LessThanTwo = "LessThanTwo",
  }
  export enum RenewableEnergy {
    PVPanels = "PVPanels",
    Inverters = "Inverters",
    Batteries = "Batteries",
  }
  export enum WarantyOfSolarSolution {
    OverFive = "OverFive",
    ThreeToFive = "ThreeToFive",
    LessThanTwo = "LessThanTwo",
  }
  