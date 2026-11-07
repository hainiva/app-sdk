// What the demo app looks like for each kind of organisation. Only words,
// colours and the icon change; the integration is the same for all of them.
// Pick one with DEMO_PRESET=gov|retail|office.
const ICONS = {
  building: '<path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/>',
  store: '<path d="M3 9l1.5-5h15L21 9M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0V9zM5 13v8h14v-8M10 21v-5h4v5"/>',
  office: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M3 21h18M8 7h4M8 11h4M8 15h4"/>',
};

export const PRESETS = {
  gov: {
    appName: "Công dân số",
    tagline: "Hỏi đáp, nhắn tin và gọi trực tiếp đến cán bộ xã, phường của bạn.",
    directoryTitle: "Liên hệ xã, phường",
    searchPlaceholder: "Tìm xã, phường…",
    destinationText: "Cán bộ tiếp nhận sẽ trả lời câu hỏi của bạn về thủ tục, hồ sơ và các dịch vụ tại địa phương.",
    staff: "Cán bộ",
    note: "Cuộc gọi qua Internet, không mất cước điện thoại.\nTin nhắn được cán bộ trả lời trong giờ làm việc.",
    user: { name: "Nguyễn Văn An", phone: "0912 345 678" },
    icon: ICONS.building,
    colors: { brand: "#0a7c8c", brand2: "#0e9aa7", soft: "#e3f4f6", callFrom: "#11606b", callTo: "#0b2a31" },
  },
  retail: {
    appName: "Cửa hàng Demo",
    tagline: "Hỏi hàng, giữ hàng và gọi thẳng đến cửa hàng gần bạn.",
    directoryTitle: "Chọn cửa hàng",
    searchPlaceholder: "Tìm cửa hàng, quận, thành phố…",
    destinationText: "Nhân viên cửa hàng trả lời về hàng còn hay hết, giữ hàng, đổi trả và giờ mở cửa.",
    staff: "Nhân viên",
    note: "Gọi qua Internet, miễn phí.\nNgoài giờ mở cửa, trợ lý AI trả lời trước, nhân viên liên hệ lại sau.",
    user: { name: "Trần Thu Hà", phone: "0987 654 321" },
    icon: ICONS.store,
    colors: { brand: "#c2410c", brand2: "#ea580c", soft: "#fff1e6", callFrom: "#7c2d12", callTo: "#2a1208" },
  },
  office: {
    appName: "Ngân hàng Demo",
    tagline: "Nhắn tin hoặc gọi đến chi nhánh và phòng ban bạn cần, không phải chờ tổng đài.",
    directoryTitle: "Chi nhánh và phòng ban",
    searchPlaceholder: "Tìm chi nhánh, phòng ban…",
    destinationText: "Chuyên viên của chi nhánh hỗ trợ về tài khoản, khoản vay, thẻ và đặt lịch hẹn tại quầy.",
    staff: "Chuyên viên",
    note: "Gọi qua Internet, miễn phí.\nNgoài giờ làm việc, bạn để lại lời nhắn và được gọi lại.",
    user: { name: "Lê Minh Quân", phone: "0903 111 222" },
    icon: ICONS.office,
    colors: { brand: "#1e3a8a", brand2: "#2563eb", soft: "#e8eefc", callFrom: "#1e3a8a", callTo: "#0b1530" },
  },
};
