import {
  ChangeEventHandler,
  CSSProperties,
  FocusEventHandler,
  HTMLInputTypeAttribute,
  ReactNode,
  WheelEvent,
  WheelEventHandler,
} from "react";
import Select, {
  ActionMeta,
  GroupBase,
  MultiValue,
  OptionsOrGroups,
  SingleValue,
} from "react-select";
import styles from "./style.module.css";
import { ErrorMessage, useField } from "formik";
import { Form, Label } from "semantic-ui-react";
import React from "react";

interface TextareaTempProps extends Omit<InputTempProps, "onChange"> {
  onChange?: ChangeEventHandler<HTMLTextAreaElement>;
  rows?: number;
}

interface InputTempProps {
  label?: string;
  name?: string;
  id?: string;
  inputType?: HTMLInputTypeAttribute | undefined;
  placeholder?: string;
  defaultValue?: any;
  value?: string;
  children?: ReactNode;
  visibilityPadding?: boolean;
  marginRight?: boolean;
  marginLeft?: boolean;
  marginLeftSm?: boolean;
  marginRightSm?: boolean;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement> | undefined;
  mode?: "light" | "dark" | "required";
  width?: string;
  style?: CSSProperties;
  inputStyle?: CSSProperties;
  labelStyle?: CSSProperties;
  fieldClass?: string;
  disabled?: boolean;
  autoComplete?: string;
}

export const InputTemp = ({
  name,
  id,
  label,
  inputType,
  placeholder,
  defaultValue,
  value,
  onChange,
  onBlur,
  children,
  visibilityPadding,
  marginRight,
  marginLeft,
  marginLeftSm,
  marginRightSm,
  mode = "dark",
  width,
  style,
  disabled,
  autoComplete,
  inputStyle = {},
  labelStyle = {},
  fieldClass,
}: InputTempProps) => {
  return (
    <div
      className={`${styles.formHolder} ${
        marginLeftSm ? styles.marginLeftSm : marginLeft && styles.marginLeft
      } ${
        marginRightSm ? styles.marginRightSm : marginRight && styles.marginRight
      } ${fieldClass}`}
      style={{ width, ...style }}
    >
      <label
        className={mode === "light" ? "text-light" : "text-dark"}
        style={{ ...labelStyle }}
      >
        {label}{" "}
        {mode === "required" && <span className={styles.required}>*</span>}
      </label>
      <div className={styles.relative}>
        <input
          autoComplete={autoComplete}
          disabled={disabled}
          placeholder={placeholder}
          type={inputType}
          id={id}
          name={name}
          value={value}
          defaultValue={defaultValue}
          onBlur={onBlur}
          style={{
            paddingRight: visibilityPadding ? "48px" : "7px",
            ...inputStyle,
          }}
          onChange={onChange}
          onWheel={(e) => e.currentTarget.blur()}
        />
        {children}
      </div>
    </div>
  );
};

interface SelectTempProps {
  label?: string;
  name: string;
  inputType?: HTMLInputTypeAttribute | undefined;
  placeholder?: string;
  value?: any;
  // onValueChange?: (
  //   newValue: MultiValue<string> | SingleValue<string>,
  //   actionMeta: ActionMeta<string>
  // ) => void;
  onValueChange?: any;
  children?: ReactNode;
  visibilityPadding?: string;
  marginRight?: boolean;
  marginLeft?: boolean;
  marginLeftSm?: boolean;
  marginRightSm?: boolean;
  options?: any[];
  isMulti?: boolean;
  defaultValue?: any;
  closeMenuOnSelect?: boolean;
  width?: string | number;
  className?: string;
  style?: CSSProperties;
  labelStyle?: CSSProperties;
  mode?: "light" | "dark" | "required";
  disabled?: boolean;
}

export const SelectTemp = ({
  label,
  name,
  placeholder,
  value,
  onValueChange,
  children,
  visibilityPadding,
  options = [],
  marginLeft,
  marginRight,
  marginLeftSm,
  marginRightSm,
  isMulti,
  defaultValue,
  closeMenuOnSelect,
  width,
  className,
  style,
  labelStyle,
  mode = "dark",
  disabled,
}: SelectTempProps) => {
  //   const selectRef = useRef(null);
  const [field, meta, helpers] = useField(name!);
  return (
    <Form.Field
      className={`${styles.formHolder} ${
        marginLeftSm ? styles.marginLeftSm : marginLeft && styles.marginLeft
      } ${
        marginRightSm ? styles.marginRightSm : marginRight && styles.marginRight
      } ${className}`}
      style={{ width, ...style, marginBottom: "0px" }}
      error={meta.touched && !!meta.error}
    >
      <label
        className={mode === "light" ? "text-light" : "text-dark"}
        style={{ ...labelStyle }}
      >
        {label}{" "}
        {mode === "required" && <span className={styles.required}>*</span>}
      </label>
      <Select
        autoFocus={false}
        isDisabled={disabled}
        value={value}
        onChange={onValueChange}
        styles={{
          multiValueLabel: (styles) => ({
            ...styles,
            fontFamily: "AppleGothic",
            fontStyle: "normal",
            fontWeight: 400,
            fontSize: "15px",
            // lineHeight: "18px",
          }),
          indicatorSeparator: (styles) => ({
            ...styles,
            display: "none",
          }),
          multiValue: (styles) => ({
            ...styles,
            backgroundColor: "transparent",
            // padding: "13px 10px",
          }),
          valueContainer: isMulti
            ? (styles) => ({
                ...styles,
                minheight: "45px",
                paddingTop: "0px",
                margin: "0px",
                borderRadius: "8px",
                alignItems: "center",
                fontFamily: "AppleGothic",
              })
            : (styles) => ({
                ...styles,
                height: "45px",
                paddingTop: "0px",
                margin: "0px",
                borderRadius: "8px",
                alignItems: "center",
                fontFamily: "AppleGothic",
              }),
          option: (styles) => ({
            ...styles,
            fontFamily: "AppleGothic",
          }),
          singleValue: (styles) => ({
            ...styles,
            // height: "100%",
            // padding: "13px 10px",
            margin: "auto 5px",
            fontFamily: "AppleGothic",
          }),
          container: (styles) => ({
            ...styles,
            // position: "absolute",
          }),
          dropdownIndicator: (styles) => ({
            ...styles,
            // color: "#2F3930",
            strokeWidth: "1px",
            border: "none",
          }),
          placeholder: (styles) => ({
            ...styles,
            fontFamily: "AppleGothic",
            fontStyle: "normal",
            fontWeight: 400,
            fontSize: "14px",
            lineHeight: "18px",
          }),
          multiValueRemove: (styles) => ({
            ...styles,
            backgroundColor: "transparent",
          }),
          clearIndicator: (styles) => ({
            ...styles,
            backgroundColor: "transparent",
          }),
          input: (styles) => ({
            ...styles,
            backgroundColor: "transparent",
            // margin: "auto 0",
          }),
          control:
            meta.touched && meta.error
              ? (styles) => ({
                  ...styles,
                  borderColor: "red",
                })
              : (styles) => ({
                  ...styles,
                }),
          //   container: (styles) => ({ ...styles, borderRadius: "8px" }),
        }}
        options={options}
        placeholder={placeholder}
        isMulti={isMulti}
        defaultValue={defaultValue}
        closeMenuOnSelect={closeMenuOnSelect}
        onBlur={() => helpers.setTouched(true)}
      />
      {/* {children} */}
      {/* {meta.touched && meta.error ? (
        <Label basic color="red">
          {meta.error}
        </Label>
      ) : null} */}
      {/* <ErrorMessage
        name={name!}
        render={(error) => <Label basic color="red" content={error} />}
      /> */}
    </Form.Field>
  );
};

export const TextareaTemp = ({
  name,
  id,
  label,
  rows,
  placeholder,
  value,
  onChange,
  children,
  visibilityPadding,
  marginRight,
  marginLeft,
  marginLeftSm,
  marginRightSm,
  mode = "dark",
  disabled,
}: TextareaTempProps) => {
  return (
    <div
      className={`${styles.formHolder} ${
        marginLeftSm ? styles.marginLeftSm : marginLeft && styles.marginLeft
      } ${
        marginRightSm ? styles.marginRightSm : marginRight && styles.marginRight
      }`}
    >
      <label className={mode === "light" ? "text-light" : "text-dark"}>
        {label}
      </label>
      <div className={styles.relative}>
        <textarea
          placeholder={placeholder}
          id={id}
          name={name}
          value={value}
          rows={rows}
          style={{ paddingRight: visibilityPadding ? "48px" : "7px" }}
          onChange={onChange}
          disabled={disabled}
        />
        {children}
      </div>
    </div>
  );
};

export const VendorInputTemp = ({
  name,
  id,
  label,
  inputType,
  placeholder,
  defaultValue,
  value,
  onChange,
  onBlur,
  children,
  visibilityPadding,
  marginRight,
  marginLeft,
  marginLeftSm,
  marginRightSm,
  mode = "dark",
  width,
  style,
  disabled,
  autoComplete,
}: InputTempProps) => {
  return (
    <div
      className={`${styles.formHolder} ${
        marginLeftSm ? styles.marginLeftSm : marginLeft && styles.marginLeft
      } ${
        marginRightSm ? styles.marginRightSm : marginRight && styles.marginRight
      }`}
      style={{ width, ...style }}
    >
      <label className={mode === "light" ? "text-light" : "text-dark"}>
        {label}
      </label>
      <div className={styles.relative}>
        <input
          autoComplete={autoComplete}
          disabled={disabled}
          placeholder={placeholder}
          type={inputType}
          id={id}
          name={name}
          // value={value}
          defaultValue={defaultValue}
          onBlur={onBlur}
          style={{ paddingRight: visibilityPadding ? "48px" : "7px" }}
          onChange={onChange}
          onWheel={(e) => e.currentTarget.blur()}
        />
        {children}
      </div>
    </div>
  );
};

export const VendorSelectTemp = ({
  label,
  name,
  placeholder,
  value,
  onValueChange,
  children,
  visibilityPadding,
  options = [],
  marginLeft,
  marginRight,
  marginLeftSm,
  marginRightSm,
  isMulti,
  defaultValue,
  closeMenuOnSelect,
  width,
  className,
  style,
  mode = "dark",
  disabled,
}: SelectTempProps) => {
  //   const selectRef = useRef(null);
  return (
    <div
      className={`${styles.formHolder} ${
        marginLeftSm ? styles.marginLeftSm : marginLeft && styles.marginLeft
      } ${
        marginRightSm ? styles.marginRightSm : marginRight && styles.marginRight
      } ${className}`}
      style={{ width, ...style }}
    >
      <label className={mode === "light" ? "text-light" : "text-dark"}>
        {label}
      </label>
      <Select
        autoFocus={false}
        isDisabled={disabled}
        value={value}
        onChange={onValueChange}
        styles={{
          multiValueLabel: (styles) => ({
            ...styles,
            fontFamily: "Sofia Pro",
            fontStyle: "normal",
            fontWeight: 400,
            fontSize: "15px",
            // lineHeight: "18px",
          }),
          indicatorSeparator: (styles) => ({
            ...styles,
            display: "none",
          }),
          multiValue: (styles) => ({
            ...styles,
            backgroundColor: "transparent",
            // padding: "13px 10px",
          }),
          valueContainer: isMulti
            ? (styles) => ({
                ...styles,
                minheight: "45px",
                paddingTop: "0px",
                margin: "0px",
                borderRadius: "8px",
                alignItems: "center",
              })
            : (styles) => ({
                ...styles,
                height: "45px",
                paddingTop: "0px",
                margin: "0px",
                borderRadius: "8px",
                alignItems: "center",
              }),
          singleValue: (styles) => ({
            ...styles,
            // height: "100%",
            // padding: "13px 10px",
            margin: "auto 5px",
          }),

          container: (styles) => ({
            ...styles,
            // position: "absolute",
          }),
          dropdownIndicator: (styles) => ({
            ...styles,
            // color: "#2F3930",
            strokeWidth: "1px",
            border: "none",
          }),
          placeholder: (styles) => ({
            ...styles,
            fontFamily: "Sofia Pro",
            fontStyle: "normal",
            fontWeight: 400,
            fontSize: "14px",
            lineHeight: "18px",
          }),
          multiValueRemove: (styles) => ({
            ...styles,
            backgroundColor: "transparent",
          }),
          clearIndicator: (styles) => ({
            ...styles,
            backgroundColor: "transparent",
          }),
          input: (styles) => ({
            ...styles,
            backgroundColor: "transparent",
            // margin: "auto 0",
          }),
          //   container: (styles) => ({ ...styles, borderRadius: "8px" }),
        }}
        options={options}
        placeholder={placeholder}
        isMulti={isMulti}
        defaultValue={defaultValue}
        closeMenuOnSelect={closeMenuOnSelect}
      />
      {children}
    </div>
  );
};
