// Typescript 선언 파일 : react-daum-postcode 모듈에 대한 타입 정의
declare module 'react-daum-postcode' {
  import { ComponentType, HTMLAttributes } from 'react';

  // DaumPostcode props 타입 정의 (필요하면 더 구체적으로 적을 수 있지만, any로 해도 무방)
  interface DaumPostcodeProps extends HTMLAttributes<HTMLDivElement> {
    onComplete?: (data: any) => void;
    style?: React.CSSProperties;
    // 필요한 다른 props가 있다면 여기에 추가
    [key: string]: any;
  }

  const DaumPostcode: ComponentType<DaumPostcodeProps>;
  const DaumPostcodeEmbed: ComponentType<DaumPostcodeProps>; // 최신 버전용

  export default DaumPostcode;
  export { DaumPostcodeEmbed };
}