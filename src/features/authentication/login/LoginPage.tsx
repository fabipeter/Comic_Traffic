import React, { useState } from "react";
import Modal from "../../../app/common/modals/Custom";
import { Form, useNavigate } from "react-router-dom";
import styles from "./styles.module.css";
import { Alert } from "@mui/material";
import { Formik, ErrorMessage } from "formik";
import { Label, Button } from "semantic-ui-react";
import { InputTemp } from "../../../app/common/form/Custom";
import { useStore } from "../../../app/stores/store";
import { LoginForm } from "../../../app/models/user";
import { authSchema } from "../../../app/validation/validationSchema";
import {
  LoginSocialGoogle,
  LoginSocialFacebook,
  LoginSocialApple,
} from "reactjs-social-login";

const LoginPage = () => {
  const navigate = useNavigate();
  const [inputField, setInputField] = useState(new LoginForm());
  const { userStore, commonStore } = useStore();
  const { login, loginStatus } = userStore;
  const { token } = commonStore;
  const [resInfo, setResInfo] = useState<{
    status: boolean | null;
    message: string;
  }>({
    status: false,
    message: "",
  });
  const google_client_id = process.env.REACT_APP_GOOGLE_CLIENT_ID;
  const facebook_app_id = process.env.REACT_APP_FACEBOOK_APP_ID;
  const apple_client_id = process.env.REACT_APP_APPLE_CLIENT_ID;
  return (
    <div className={styles.loginPage}>
      <Modal
        variant="unstyled"
        style={{ position: "fixed", zIndex: "2" }}
        openModal={true}
        closeModal={() => navigate(-1)}
      >
        <div className={styles.verifyAccountModal}>
          <h2>Login</h2>
          <div className={styles.welcomeText}>Welcome to BudgetXplora</div>
          <Formik
            initialValues={inputField}
            enableReinitialize
            onSubmit={(values) => {
              //   clearError();
              login(values).catch((error: string) =>
                setResInfo({
                  status: true,
                  message: error,
                })
              );
            }}
            validationSchema={authSchema.login}
          >
            {({
              dirty,
              touched,
              errors,
              getFieldProps,
              handleSubmit,
              values,
              setFieldValue,
              isValid,
              isSubmitting,
            }) => {
              return (
                <Form onSubmit={handleSubmit} className={styles.loginForm}>
                  <InputTemp
                    label="Email Address"
                    labelStyle={{
                      fontFamily: "AppleGothic",
                      color: "#828282",
                      fontSize: "12px",
                    }}
                    inputStyle={{ borderRadius: "15px" }}
                    inputType={"email"}
                    placeholder="email@host.co.."
                    {...getFieldProps("email")}
                    name="email"
                  />
                  <ErrorMessage
                    name={"email"}
                    render={(error: any) => (
                      <Label basic color="red" content={error} />
                    )}
                  />

                  <div className={styles.infotext}>
                    We’ll send you an otp via mail to confirm your email. By
                    clicking the continue you accept our
                  </div>
                  <div className={styles.termslink}>Terms and Conditions</div>
                  {/* <div className={styles.sterlinks}>
                    <span onClick={() => navigate("/change-password")}>
                      Forgot Password?
                    </span>{" "}
                  </div> */}
                  <div className={styles.next}>
                    {/* {resInfo.status && touched && dirty && (
                      <Alert variant="danger" onClose={clearError} dismissible>
                        {resInfo.message}
                      </Alert>
                    )} */}
                    <Button
                      positive
                      className={styles.positive}
                      disabled={!dirty || !isValid}
                      type="submit"
                      loading={loginStatus === "loading"}
                    >
                      <div className={styles.button}>Continue</div>
                    </Button>
                  </div>
                  <div className={styles.signuplink}>
                    <span>Don’t have an account?</span>
                    <span
                      onClick={() => navigate("/register")}
                      className={styles.termslink}
                    >
                      Sign up
                    </span>{" "}
                  </div>
                </Form>
              );
            }}
          </Formik>
          <div className={styles.loginForm}>
            <div className={styles.or}>
              {" "}
              <hr />
              <span>or</span>
              <hr />
            </div>
            <div className={styles.socialButtons}>
              <div>
                <LoginSocialGoogle
                  client_id={google_client_id ? google_client_id : ""}
                  discoveryDocs=""
                  access_type=""
                  onResolve={({ provider, data }) => {
                    console.log(provider, data);
                  }}
                  onReject={(error) => {
                    console.log(error);
                  }}
                >
                  <Button className={styles.socialButton} type="button">
                    <div className={styles.button}>Google</div>
                  </Button>
                </LoginSocialGoogle>
              </div>
              <div>
                <LoginSocialFacebook
                  appId={facebook_app_id ? facebook_app_id : ""}
                  onResolve={({ provider, data }) => {
                    console.log(provider, data);
                  }}
                  onReject={(error) => {
                    console.log(error);
                  }}
                >
                  <Button className={styles.socialButton} type="button">
                    <div className={styles.button}>Facebook</div>
                  </Button>
                </LoginSocialFacebook>
              </div>
              {/* <div>
                <LoginSocialApple
                  client_id={apple_client_id ? apple_client_id : ""}
                  onResolve={() => {}}
                  onReject={() => {}}
                >
                  <Button className={styles.socialButton} type="button" disabled>
                    <div className={styles.button}>Apple</div>
                  </Button>
                </LoginSocialApple>
              </div> */}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default LoginPage;
