import type { ThemeConfig } from 'antd';

/**
 * Ant Design 6 主题配置
 * 1:1 映射 radius-admin.css 的设计令牌，保留深色侧边栏 + 品牌色。
 */
const theme: ThemeConfig = {
  token: {
    colorPrimary: '#0071e3',
    colorText: '#1d1d1f',
    colorTextSecondary: '#424245',
    colorTextTertiary: '#6e6e73',
    colorBgLayout: '#ffffff',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBorderSecondary: '#e8e8ed',
    borderRadius: 8,
    fontFamily:
      '"SF Pro Text", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif',
    fontSize: 14,
    lineHeight: 1.47,
    boxShadow:
      '0 12px 32px rgba(0, 0, 0, 0.08)',
  },
  components: {
    Layout: {
      siderBg: '#0F1923',
      headerBg: '#ffffff',
      bodyBg: '#ffffff',
    },
    Menu: {
      darkItemBg: '#0F1923',
      darkItemSelectedBg: '#1A2C42',
      darkItemColor: 'rgba(255,255,255,0.65)',
      darkItemSelectedColor: '#ffffff',
      darkItemHoverBg: 'rgba(255,255,255,0.08)',
      itemBorderRadius: 6,
      itemMarginInline: 8,
    },
    Table: {
      headerBg: '#FAFBFC',
      headerColor: '#6e6e73',
      rowHoverBg: 'rgba(0,0,0,0.022)',
      borderColor: '#e8e8ed',
    },
    Button: {
      borderRadius: 8,
      controlHeight: 32,
      fontSize: 13,
      fontWeight: 500,
    },
    Card: {
      borderRadiusLG: 18,
      paddingLG: 20,
    },
    Modal: {
      borderRadiusLG: 14,
      titleFontSize: 15,
    },
    Drawer: {
      borderRadiusLG: 0,
    },
    Input: {
      borderRadius: 8,
      controlHeight: 32,
    },
    Select: {
      borderRadius: 8,
      controlHeight: 32,
    },
    Form: {
      itemMarginBottom: 16,
      labelFontSize: 13,
    },
    Tag: {
      borderRadiusSM: 980,
    },
    Tabs: {
      horizontalItemGutter: 4,
    },
  },
};

export default theme;
