import 'package:flutter/material.dart';
import 'coui_colors.dart';

/// Authentic ColorOS (COUI) Theme Definitions
class CouiTheme {
  static const double cardCornerRadius = 16.0;
  static const double buttonCornerRadius = 24.0;
  static const double dialogCornerRadius = 16.0;

  static ThemeData lightTheme() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      primaryColor: CouiColors.primaryGreen,
      scaffoldBackgroundColor: CouiColors.backgroundLight,
      colorScheme: const ColorScheme.light(
        primary: CouiColors.primaryGreen,
        secondary: CouiColors.primaryGreenDark,
        surface: CouiColors.surfaceLight,
        background: CouiColors.backgroundLight,
        onPrimary: Colors.white,
        onSurface: CouiColors.textPrimaryLight,
        onBackground: CouiColors.textPrimaryLight,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: CouiColors.backgroundLight,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        iconTheme: IconThemeData(color: CouiColors.textPrimaryLight),
        titleTextStyle: TextStyle(
          color: CouiColors.textPrimaryLight,
          fontSize: 24,
          fontWeight: FontWeight.bold,
          letterSpacing: -0.5,
        ),
      ),
      cardTheme: CardTheme(
        color: CouiColors.cardLight,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(cardCornerRadius),
        ),
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: CouiColors.primaryGreen,
        foregroundColor: Colors.white,
        elevation: 2,
        shape: StadiumBorder(),
      ),
    );
  }

  static ThemeData darkTheme() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      primaryColor: CouiColors.primaryGreen,
      scaffoldBackgroundColor: CouiColors.backgroundDark,
      colorScheme: const ColorScheme.dark(
        primary: CouiColors.primaryGreen,
        secondary: CouiColors.primaryGreenDark,
        surface: CouiColors.surfaceDark,
        background: CouiColors.backgroundDark,
        onPrimary: Colors.white,
        onSurface: CouiColors.textPrimaryDark,
        onBackground: CouiColors.textPrimaryDark,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: CouiColors.backgroundDark,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        iconTheme: IconThemeData(color: CouiColors.textPrimaryDark),
        titleTextStyle: TextStyle(
          color: CouiColors.textPrimaryDark,
          fontSize: 24,
          fontWeight: FontWeight.bold,
          letterSpacing: -0.5,
        ),
      ),
      cardTheme: CardTheme(
        color: CouiColors.cardDark,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(cardCornerRadius),
        ),
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: CouiColors.primaryGreen,
        foregroundColor: Colors.white,
        elevation: 2,
        shape: StadiumBorder(),
      ),
    );
  }
}
