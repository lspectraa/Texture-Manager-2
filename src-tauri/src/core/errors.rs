use std::error::Error;
use std::fmt::{Display, Formatter};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppError {
    InvalidPath(&'static str),
    InvalidOperation(&'static str),
    IoError(String),
    ParseError(String),
    Cancelled,
}

impl Display for AppError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::InvalidPath(message) => write!(f, "invalid path: {message}"),
            AppError::InvalidOperation(message) => write!(f, "invalid operation: {message}"),
            AppError::IoError(message) => write!(f, "io error: {message}"),
            AppError::ParseError(message) => write!(f, "parse error: {message}"),
            AppError::Cancelled => write!(f, "operation cancelled"),
        }
    }
}

impl Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        AppError::IoError(value.to_string())
    }
}
