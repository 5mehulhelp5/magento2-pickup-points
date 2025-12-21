<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Model\Order\Pdf;

use Innosend\PickupPoints\Helper\ShippingInformation;
use Magento\Framework\App\ResourceConnection;
use Magento\Sales\Model\RtlTextHandler;
use Psr\Log\LoggerInterface;

/**
 * Extended Invoice PDF to add pickup point information
 */
class Invoice extends \Magento\Sales\Model\Order\Pdf\Invoice
{
    /**
     * @var ResourceConnection
     */
    private $resourceConnection;

    /**
     * @var ShippingInformation
     */
    private $shippingInformation;

    /**
     * @var LoggerInterface
     */
    private $logger;

    /**
     * @var RtlTextHandler
     */
    private $rtlTextHandler;

    /**
     * @param \Magento\Payment\Helper\Data $paymentData
     * @param \Magento\Framework\Stdlib\StringUtils $string
     * @param \Magento\Framework\App\Config\ScopeConfigInterface $scopeConfig
     * @param \Magento\Framework\Filesystem $filesystem
     * @param \Magento\Sales\Model\Order\Pdf\Config $pdfConfig
     * @param \Magento\Sales\Model\Order\Pdf\Total\Factory $pdfTotalFactory
     * @param \Magento\Sales\Model\Order\Pdf\ItemsFactory $pdfItemsFactory
     * @param \Magento\Framework\Stdlib\DateTime\TimezoneInterface $localeDate
     * @param \Magento\Framework\Translate\Inline\StateInterface $inlineTranslation
     * @param \Magento\Sales\Model\Order\Address\Renderer $addressRenderer
     * @param \Magento\Store\Model\StoreManagerInterface $storeManager
     * @param \Magento\Store\Model\App\Emulation $appEmulation
     * @param ResourceConnection $resourceConnection
     * @param ShippingInformation $shippingInformation
     * @param RtlTextHandler $rtlTextHandler
     * @param LoggerInterface $logger
     * @param array $data
     */
    public function __construct(
        \Magento\Payment\Helper\Data $paymentData,
        \Magento\Framework\Stdlib\StringUtils $string,
        \Magento\Framework\App\Config\ScopeConfigInterface $scopeConfig,
        \Magento\Framework\Filesystem $filesystem,
        \Magento\Sales\Model\Order\Pdf\Config $pdfConfig,
        \Magento\Sales\Model\Order\Pdf\Total\Factory $pdfTotalFactory,
        \Magento\Sales\Model\Order\Pdf\ItemsFactory $pdfItemsFactory,
        \Magento\Framework\Stdlib\DateTime\TimezoneInterface $localeDate,
        \Magento\Framework\Translate\Inline\StateInterface $inlineTranslation,
        \Magento\Sales\Model\Order\Address\Renderer $addressRenderer,
        \Magento\Store\Model\StoreManagerInterface $storeManager,
        \Magento\Store\Model\App\Emulation $appEmulation,
        ResourceConnection $resourceConnection,
        ShippingInformation $shippingInformation,
        RtlTextHandler $rtlTextHandler,
        LoggerInterface $logger,
        array $data = []
    ) {
        parent::__construct(
            $paymentData,
            $string,
            $scopeConfig,
            $filesystem,
            $pdfConfig,
            $pdfTotalFactory,
            $pdfItemsFactory,
            $localeDate,
            $inlineTranslation,
            $addressRenderer,
            $storeManager,
            $appEmulation,
            $data
        );
        
        $this->resourceConnection = $resourceConnection;
        $this->shippingInformation = $shippingInformation;
        $this->rtlTextHandler = $rtlTextHandler;
        $this->logger = $logger;
    }

    /**
     * Insert order with pickup point information
     * Override of parent method to inject pickup point info in shipping address section
     *
     * @param \Zend_Pdf_Page $page
     * @param \Magento\Sales\Model\Order|\Magento\Sales\Model\Order\Shipment $obj
     * @param bool $putOrderId
     * @return void
     * @SuppressWarnings(PHPMD.CyclomaticComplexity)
     * @SuppressWarnings(PHPMD.NPathComplexity)
     * @SuppressWarnings(PHPMD.ExcessiveMethodLength)
     */
    protected function insertOrder(&$page, $obj, $putOrderId = true)
    {
        if ($obj instanceof \Magento\Sales\Model\Order) {
            $shipment = null;
            $order = $obj;
        } elseif ($obj instanceof \Magento\Sales\Model\Order\Shipment) {
            $shipment = $obj;
            $order = $shipment->getOrder();
        }

        $this->y = $this->y ? $this->y : 815;
        $top = $this->y;

        $page->setFillColor(new \Zend_Pdf_Color_GrayScale(0.45));
        $page->setLineColor(new \Zend_Pdf_Color_GrayScale(0.45));
        $page->drawRectangle(25, $top, 570, $top - 55);
        $page->setFillColor(new \Zend_Pdf_Color_GrayScale(1));
        $this->setDocHeaderCoordinates([25, $top, 570, $top - 55]);
        $this->_setFontRegular($page, 10);

        if ($putOrderId) {
            $page->drawText(__('Order # ') . $order->getRealOrderId(), 35, $top -= 30, 'UTF-8');
            $top +=15;
        }

        $top -=30;
        $page->drawText(
            __('Order Date: ') .
            $this->_localeDate->formatDate(
                $this->_localeDate->scopeDate(
                    $order->getStore(),
                    $order->getCreatedAt(),
                    true
                ),
                \IntlDateFormatter::MEDIUM,
                false
            ),
            35,
            $top,
            'UTF-8'
        );

        $top -= 10;
        $page->setFillColor(new \Zend_Pdf_Color_Rgb(0.93, 0.92, 0.92));
        $page->setLineColor(new \Zend_Pdf_Color_GrayScale(0.5));
        $page->setLineWidth(0.5);
        $page->drawRectangle(25, $top, 275, $top - 25);
        $page->drawRectangle(275, $top, 570, $top - 25);

        /* Calculate blocks info */

        /* Billing Address */
        $billingAddress = $this->_formatAddress($this->addressRenderer->format($order->getBillingAddress(), 'pdf'));

        /* Payment */
        $paymentInfo = $this->_paymentData->getInfoBlock($order->getPayment())->setIsSecureMode(true)->toPdf();
        $paymentInfo = $paymentInfo !== null ? htmlspecialchars_decode($paymentInfo, ENT_QUOTES) : '';
        $payment = explode('{{pdf_row_separator}}', $paymentInfo);
        foreach ($payment as $key => $value) {
            if ($value && strip_tags(trim($value)) == '') {
                unset($payment[$key]);
            }
        }
        reset($payment);

        /* Shipping Address and Method */
        if (!$order->getIsVirtual()) {
            // Check if this is a pickup point order
            $isPickupPointOrder = false;
            $pickupPointData = null;
            
            if (preg_match('/^innosend_pickup_points/', $order->getShippingMethod())) {
                $pickupPointData = $this->getPickupPointData((int)$order->getId());
                $isPickupPointOrder = !empty($pickupPointData);
            }
            
            if ($isPickupPointOrder) {
                /* Use pickup point info instead of shipping address */
                $shippingAddress = $this->formatPickupPointForPdf($pickupPointData);
            } else {
                /* Standard Shipping Address */
                $shippingAddress = $this->_formatAddress(
                    $this->addressRenderer->format($order->getShippingAddress(), 'pdf')
                );
            }
            
            $shippingMethod = $order->getShippingDescription();
        }

        // Rest of the method follows parent implementation exactly
        $page->setFillColor(new \Zend_Pdf_Color_GrayScale(0));
        $this->_setFontBold($page, 12);
        $page->drawText(__('Sold to:'), 35, $top - 15, 'UTF-8');

        if (!$order->getIsVirtual()) {
            $page->drawText(__('Ship to:'), 285, $top - 15, 'UTF-8');
        } else {
            $page->drawText(__('Payment Method:'), 285, $top - 15, 'UTF-8');
        }

        $addressesHeight = $this->_calcAddressHeight($billingAddress);
        if (isset($shippingAddress)) {
            $addressesHeight = max($addressesHeight, $this->_calcAddressHeight($shippingAddress));
        }

        $page->setFillColor(new \Zend_Pdf_Color_GrayScale(1));
        $page->drawRectangle(25, $top - 25, 570, $top - 33 - $addressesHeight);
        $page->setFillColor(new \Zend_Pdf_Color_GrayScale(0));
        $this->_setFontRegular($page, 10);
        $this->y = $top - 40;
        $addressesStartY = $this->y;

        foreach ($billingAddress as $value) {
            if ($value !== '') {
                $text = [];
                foreach ($this->string->split($value, 45, true, true) as $_value) {
                    $text[] = $this->rtlTextHandler->reverseRtlText($_value);
                }
                foreach ($text as $part) {
                    $page->drawText(strip_tags(ltrim($part ?: '')), 35, $this->y, 'UTF-8');
                    $this->y -= 15;
                }
            }
        }

        $addressesEndY = $this->y;

        if (!$order->getIsVirtual()) {
            $this->y = $addressesStartY;
            $shippingAddress = $shippingAddress ?? [];
            foreach ($shippingAddress as $value) {
                if ($value !== '') {
                    $text = [];
                    foreach ($this->string->split($value, 45, true, true) as $_value) {
                        $text[] = $this->rtlTextHandler->reverseRtlText($_value);
                    }
                    foreach ($text as $part) {
                        $page->drawText(strip_tags(ltrim($part ?: '')), 285, $this->y, 'UTF-8');
                        $this->y -= 15;
                    }
                }
            }

            $addressesEndY = min($addressesEndY, $this->y);
            $this->y = $addressesEndY;

            $page->setFillColor(new \Zend_Pdf_Color_Rgb(0.93, 0.92, 0.92));
            $page->setLineWidth(0.5);
            $page->drawRectangle(25, $this->y, 275, $this->y - 25);
            $page->drawRectangle(275, $this->y, 570, $this->y - 25);

            $this->y -= 15;
            $this->_setFontBold($page, 12);
            $page->setFillColor(new \Zend_Pdf_Color_GrayScale(0));
            $page->drawText(__('Payment Method:'), 35, $this->y, 'UTF-8');
            $page->drawText(__('Shipping Method:'), 285, $this->y, 'UTF-8');

            $this->y -= 10;
            $page->setFillColor(new \Zend_Pdf_Color_GrayScale(1));

            $this->_setFontRegular($page, 10);
            $page->setFillColor(new \Zend_Pdf_Color_GrayScale(0));

            $paymentLeft = 35;
            $yPayments = $this->y - 15;
        } else {
            $yPayments = $addressesStartY;
            $paymentLeft = 285;
        }

        foreach ($payment as $value) {
            if ($value && trim($value) != '') {
                //Printing "Payment Method" lines
                $value = preg_replace('/<br[^>]*>/i', "\n", $value);
                foreach ($this->string->split($value, 45, true, true) as $_value) {
                    $page->drawText(strip_tags(trim($_value ?: '')), $paymentLeft, $yPayments, 'UTF-8');
                    $yPayments -= 15;
                }
            }
        }

        if ($order->getIsVirtual()) {
            // replacement of Shipments-Payments rectangle block
            $yPayments = min($addressesEndY, $yPayments);
            $page->drawLine(25, $top - 25, 25, $yPayments);
            $page->drawLine(570, $top - 25, 570, $yPayments);
            $page->drawLine(25, $yPayments, 570, $yPayments);

            $this->y = $yPayments - 15;
        } else {
            $topMargin = 15;
            $methodStartY = $this->y;
            $this->y -= 15;

            if (isset($shippingMethod) && \is_string($shippingMethod)) {
                foreach ($this->string->split($shippingMethod, 45, true, true) as $_value) {
                    $page->drawText(strip_tags(trim($_value ?: '')), 285, $this->y, 'UTF-8');
                    $this->y -= 15;
                }
            }

            $yShipments = $this->y;
            $totalShippingChargesText = "("
                . __('Total Shipping Charges')
                . " "
                . $order->formatPriceTxt($order->getShippingAmount())
                . ")";

            $page->drawText($totalShippingChargesText, 285, $yShipments - $topMargin, 'UTF-8');
            $yShipments -= $topMargin + 10;

            $tracks = [];
            if ($shipment) {
                $tracks = $shipment->getAllTracks();
            }
            if (count($tracks)) {
                $page->setFillColor(new \Zend_Pdf_Color_Rgb(0.93, 0.92, 0.92));
                $page->setLineWidth(0.5);
                $page->drawRectangle(285, $yShipments, 510, $yShipments - 10);
                $page->drawLine(400, $yShipments, 400, $yShipments - 10);

                $this->_setFontRegular($page, 9);
                $page->setFillColor(new \Zend_Pdf_Color_GrayScale(0));
                $page->drawText(__('Title'), 290, $yShipments - 7, 'UTF-8');
                $page->drawText(__('Number'), 410, $yShipments - 7, 'UTF-8');

                $yShipments -= 20;
                $this->_setFontRegular($page, 8);
                foreach ($tracks as $track) {
                    $maxTitleLen = 45;
                    $trackTitle = $track->getTitle() ?? '';
                    $endOfTitle = strlen($trackTitle) > $maxTitleLen ? '...' : '';
                    $truncatedTitle = substr($trackTitle, 0, $maxTitleLen) . $endOfTitle;
                    $page->drawText($truncatedTitle, 292, $yShipments, 'UTF-8');
                    $page->drawText($track->getNumber(), 410, $yShipments, 'UTF-8');
                    $yShipments -= $topMargin - 5;
                }
            } else {
                $yShipments -= $topMargin - 5;
            }

            $currentY = min($yPayments, $yShipments);

            // replacement of Shipments-Payments rectangle block
            $page->drawLine(25, $methodStartY, 25, $currentY);
            $page->drawLine(25, $currentY, 570, $currentY);
            $page->drawLine(570, $currentY, 570, $methodStartY);

            $this->y = $currentY;
            $this->y -= 15;
        }
    }

    /**
     * Get pickup point data from database
     *
     * @param int $orderId
     * @return array|null
     */
    private function getPickupPointData(int $orderId): ?array
    {
        try {
            $connection = $this->resourceConnection->getConnection();
            $tableName = $this->resourceConnection->getTableName('fm_innosend_order');

            if (!$connection->isTableExists($tableName)) {
                return null;
            }

            $select = $connection->select()
                ->from($tableName, 'shipping_information')
                ->where('order_id = ?', $orderId);
            $shippingInformationJson = $connection->fetchOne($select);

            if ($shippingInformationJson) {
                $shippingInformation = $this->shippingInformation->parseShippingInformation($shippingInformationJson);
                return $this->shippingInformation->extractPickupPoint($shippingInformation);
            }
        } catch (\Exception $e) {
            $this->logger->error('Innosend Pickup Points: Failed to load pickup point data for PDF', [
                'order_id' => $orderId,
                'error' => $e->getMessage(),
            ]);
        }

        return null;
    }

    /**
     * Format pickup point data for PDF rendering
     * Returns array format compatible with address rendering
     *
     * @param array $pickupPointData
     * @return array
     */
    private function formatPickupPointForPdf(array $pickupPointData): array
    {
        $carrier = !empty($pickupPointData['pickup_point_carrier']) 
            ? strtoupper($pickupPointData['pickup_point_carrier']) 
            : '';
        
        // Build header: "POSTNL Pickup Point:"
        $header = $carrier ? $carrier . ' ' . __('Pickup Point:') : __('Pickup Point:');
        
        // Get name
        $name = $pickupPointData['pickup_point_name'] ?? '';
        
        // Parse address: first comma = newline, remove second comma
        $addressString = $pickupPointData['pickup_point_address'] ?? '';
        $addressParts = array_map('trim', explode(',', $addressString, 2)); // Split on FIRST comma only
        
        // First part: street + number (e.g., "Peizerweg 89")
        $street = $addressParts[0] ?? '';
        
        // Second part: city (may still have commas, which we remove)
        $city = isset($addressParts[1]) ? str_replace(',', '', $addressParts[1]) : '';
        
        // Build array for PDF rendering (each element = one line)
        return [
            $header,        // Line 1: "POSTNL Pickup Point:"
            '',             // Line 2: empty line
            $name,          // Line 3: pickup point name
            $street,        // Line 4: "Peizerweg 89"
            $city,          // Line 5: "Groningen"
        ];
    }

    /**
     * Add carrier logo to PDF page
     *
     * @param \Zend_Pdf_Page $page
     * @param string $carrier
     * @return void
     */
    private function addCarrierLogo($page, string $carrier): void
    {
        try {
            // Try to load PNG logo
            $logoPath = BP . '/app/code/Innosend/PickupPoints/view/adminhtml/web/images/carriers/' 
                       . strtolower($carrier) . '.png';
            
            // Alternative path in package-source
            if (!file_exists($logoPath)) {
                $logoPath = BP . '/package-source/innosend/magento2-pickup-points/src/view/adminhtml/web/images/carriers/' 
                           . strtolower($carrier) . '.png';
            }
            
            if (!file_exists($logoPath)) {
                $this->logger->debug('Innosend Pickup Points: Logo not found', [
                    'carrier' => $carrier,
                    'path' => $logoPath,
                ]);
                return;
            }
            
            // Load image
            $image = \Zend_Pdf_Image::imageWithPath($logoPath);
            
            // Position: right side of shipping section, aligned with top of pickup point info
            // X: 480-570 (right column, right side)
            // Y: around 760 (top of shipping section)
            $logoX1 = 480;
            $logoX2 = 550;
            $logoY1 = 760;
            $logoY2 = 790;
            
            // Draw logo
            $page->drawImage($image, $logoX1, $logoY1, $logoX2, $logoY2);
            
            $this->logger->info('Innosend Pickup Points: Added carrier logo to PDF', [
                'carrier' => $carrier,
            ]);
            
        } catch (\Exception $e) {
            $this->logger->error('Innosend Pickup Points: Failed to add carrier logo to PDF', [
                'carrier' => $carrier,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
