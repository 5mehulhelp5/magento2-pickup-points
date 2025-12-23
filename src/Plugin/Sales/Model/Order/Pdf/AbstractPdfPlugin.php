<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Plugin\Sales\Model\Order\Pdf;

use Innosend\PickupPoints\Helper\ShippingInformation;
use Magento\Framework\App\ResourceConnection;
use Magento\Sales\Model\Order;
use Magento\Sales\Model\Order\Pdf\AbstractPdf;
use Magento\Sales\Model\Order\Shipment;
use Psr\Log\LoggerInterface;

/**
 * Plugin to add pickup point information to PDF documents
 */
class AbstractPdfPlugin
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
     * @param ResourceConnection $resourceConnection
     * @param ShippingInformation $shippingInformation
     * @param LoggerInterface $logger
     */
    public function __construct(
        ResourceConnection $resourceConnection,
        ShippingInformation $shippingInformation,
        LoggerInterface $logger
    ) {
        $this->resourceConnection = $resourceConnection;
        $this->shippingInformation = $shippingInformation;
        $this->logger = $logger;
    }

    /**
     * Add pickup point information to PDF around insertOrder
     *
     * @param AbstractPdf $subject
     * @param callable $proceed
     * @param \Zend_Pdf_Page $page
     * @param Order|Shipment $obj
     * @param bool $putOrderId
     * @return void
     */
    public function aroundInsertOrder(
        AbstractPdf $subject,
        callable $proceed,
        &$page,
        $obj,
        $putOrderId = true
    ) {
        // Call original method first
        $proceed($page, $obj, $putOrderId);

        $this->logger->info('Innosend Pickup Points PDF Plugin: aroundInsertOrder called after proceed');

        try {
            // Get the order
            if ($obj instanceof Order) {
                $order = $obj;
            } elseif ($obj instanceof Shipment) {
                $order = $obj->getOrder();
            } else {
                $this->logger->info('Innosend Pickup Points PDF Plugin: obj is not Order or Shipment');
                return;
            }

            $orderId = $order->getId();
            $shippingMethod = $order->getShippingMethod();
            
            $this->logger->info('Innosend Pickup Points PDF Plugin: Processing order', [
                'order_id' => $orderId,
                'shipping_method' => $shippingMethod,
            ]);

            // Check if shipping method is pickup points
            if (!$shippingMethod || !preg_match('/^innosend_pickup_points/', $shippingMethod)) {
                $this->logger->info('Innosend Pickup Points PDF Plugin: Not a pickup points shipping method');
                return;
            }

            $this->logger->info('Innosend Pickup Points PDF Plugin: Is pickup points method, getting data...');

            // Get pickup point data
            $pickupPointData = $this->getPickupPointData($orderId);
            if (!$pickupPointData) {
                $this->logger->warning('Innosend Pickup Points PDF Plugin: No pickup point data found');
                return;
            }

            $this->logger->info('Innosend Pickup Points PDF Plugin: Found pickup point data, adding to PDF', [
                'data' => $pickupPointData,
            ]);

            // Add pickup point information to PDF
            $this->addPickupPointToPdf($subject, $page, $pickupPointData);

            $this->logger->info('Innosend Pickup Points PDF Plugin: Successfully added pickup point to PDF');

        } catch (\Exception $e) {
            $this->logger->error('Innosend Pickup Points PDF Plugin: Exception occurred', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
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
     * Add pickup point information to PDF page
     *
     * @param AbstractPdf $subject
     * @param \Zend_Pdf_Page $page
     * @param array $pickupPointData
     * @return void
     */
    private function addPickupPointToPdf(AbstractPdf $subject, $page, array $pickupPointData): void
    {
        try {
            // Get current Y position from subject
            $y = $subject->y;

            // Add some spacing
            $y -= 25;

            // Calculate box height based on content
            $boxHeight = 65;
            if (!empty($pickupPointData['pickup_point_address'])) {
                $addressLines = explode(',', $pickupPointData['pickup_point_address']);
                $boxHeight += (count($addressLines) * 12);
            }

            // Draw background box (light green background like CSS: #F6FBF6)
            $page->setFillColor(new \Zend_Pdf_Color_Html('#F6FBF6'));
            $page->setLineColor(new \Zend_Pdf_Color_Html('#e3e3e3'));
            $page->setLineWidth(0.5);
            $page->drawRectangle(285, $y, 570, $y - $boxHeight);

            // Draw top border (matches border-top: 1px solid #e3e3e3)
            $page->setLineColor(new \Zend_Pdf_Color_Html('#e3e3e3'));
            $page->setLineWidth(1);
            $page->drawLine(285, $y, 570, $y);

            // Set text color to black
            $page->setFillColor(new \Zend_Pdf_Color_GrayScale(0));

            // Draw header "Pickup Point Information" (bold, larger font like CSS)
            $y -= 15;
            $subject->_setFontBold($page, 11);
            $page->drawText(__('Pickup Point Information'), 295, $y, 'UTF-8');

            // Add spacing after header
            $y -= 18;

            // Draw pickup point name (bold like CSS)
            if (!empty($pickupPointData['pickup_point_name'])) {
                $subject->_setFontBold($page, 10);
                $page->drawText($pickupPointData['pickup_point_name'], 295, $y, 'UTF-8');
                $y -= 14;
            }

            // Draw pickup point address (regular font)
            if (!empty($pickupPointData['pickup_point_address'])) {
                $subject->_setFontRegular($page, 9);
                $addressLines = explode(',', $pickupPointData['pickup_point_address']);
                foreach ($addressLines as $line) {
                    $line = trim($line);
                    if ($line) {
                        $page->drawText($line, 295, $y, 'UTF-8');
                        $y -= 12;
                    }
                }
            }

            // Try to add carrier logo (like the img element in HTML)
            if (!empty($pickupPointData['pickup_point_carrier'])) {
                $this->addCarrierLogo($page, $pickupPointData['pickup_point_carrier'], $y);
            }

            // Update Y position in subject (add extra spacing after box)
            $subject->y = $y - 15;

        } catch (\Exception $e) {
            $this->logger->error('Innosend Pickup Points: Failed to add pickup point to PDF', [
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Add carrier logo to PDF
     *
     * @param \Zend_Pdf_Page $page
     * @param string $carrier
     * @param int $y
     * @return void
     */
    private function addCarrierLogo($page, string $carrier, int $y): void
    {
        try {
            // Logo position: right side of the box (like CSS: justify-content: space-between)
            $logoX = 520;
            $logoY = $y + 20;

            // Logo path
            $logoPath = BP . '/app/code/Innosend/PickupPoints/view/adminhtml/web/images/carriers/' . 
                        strtolower($carrier) . '.svg';

            // Alternative path if in vendor
            if (!file_exists($logoPath)) {
                $logoPath = BP . '/vendor/innosend/magento2-pickup-points/src/view/adminhtml/web/images/carriers/' . 
                           strtolower($carrier) . '.svg';
            }

            // For SVG, we'll just display the carrier name in bold as fallback
            // (SVG rendering in PDF requires additional processing)
            $carrierText = strtoupper($carrier);
            $page->setFillColor(new \Zend_Pdf_Color_Html('#333333'));
            $page->setFont(\Zend_Pdf_Font::fontWithName(\Zend_Pdf_Font::FONT_HELVETICA_BOLD), 9);
            $page->drawText($carrierText, $logoX, $logoY, 'UTF-8');

        } catch (\Exception $e) {
            $this->logger->debug('Innosend Pickup Points: Could not add carrier logo to PDF', [
                'carrier' => $carrier,
                'error' => $e->getMessage(),
            ]);
        }
    }
}

